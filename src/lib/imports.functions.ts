import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ImportInput = z.object({
  fileName: z.string().min(1),
  fileType: z.string().min(1), // mime
  base64: z.string().min(1),
});

const TxnSchema = z.object({
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  transaction_type: z.enum(["credit", "debit"]),
  merchant: z.string().optional(),
});
type ParsedTxn = z.infer<typeof TxnSchema>;

function detectKind(fileName: string, mime: string): "ofx" | "csv" | "xlsx" | "pdf" | "image" | "unknown" {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".ofx") || mime.includes("ofx")) return "ofx";
  if (lower.endsWith(".csv") || mime === "text/csv") return "csv";
  if (lower.endsWith(".xlsx") || lower.endsWith(".xls") || mime.includes("spreadsheet") || mime.includes("excel")) return "xlsx";
  if (lower.endsWith(".pdf") || mime === "application/pdf") return "pdf";
  if (mime.startsWith("image/") || /\.(jpg|jpeg|png|webp)$/i.test(lower)) return "image";
  return "unknown";
}

function decodeBase64ToString(b64: string): string {
  return Buffer.from(b64, "base64").toString("utf-8");
}
function decodeBase64ToArrayBuffer(b64: string): ArrayBuffer {
  const buf = Buffer.from(b64, "base64");
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

async function extractFromImageOrPdf(base64: string, mime: string): Promise<ParsedTxn[]> {
  const { getAiProvider, CHAT_MODEL } = await import("./ai-gateway.server");
  const { generateObject, NoObjectGeneratedError } = await import("ai");
  const provider = getAiProvider();
  const dataUrl = `data:${mime};base64,${base64}`;

  const schema = z.object({
    transactions: z.array(z.object({
      date: z.string().describe("ISO date YYYY-MM-DD"),
      description: z.string(),
      amount: z.number().describe("positive number, no sign"),
      transaction_type: z.enum(["credit", "debit"]),
      merchant: z.string().optional(),
    })),
  });

  try {
    const { object } = await generateObject({
      model: provider(CHAT_MODEL),
      schema,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: "Extraia TODAS as transações financeiras deste extrato bancário, fatura de cartão ou recibo. Responda APENAS com JSON válido no schema fornecido. Datas em ISO YYYY-MM-DD. amount sempre positivo (sem sinal). transaction_type='debit' para saídas/gastos e 'credit' para entradas/depósitos. Se não encontrar nenhuma transação, retorne { \"transactions\": [] }. Mantenha descrições originais em português." },
            { type: "image", image: dataUrl },
          ],
        },
      ],
    });
    return object.transactions;
  } catch (e) {
    if (NoObjectGeneratedError.isInstance(e)) {
      const text = (e as { text?: string }).text ?? "";
      const match = text.match(/\{[\s\S]*\}/);
      if (match) {
        try {
          return schema.parse(JSON.parse(match[0])).transactions;
        } catch {
          // fall through
        }
      }
      throw new Error("A IA não conseguiu extrair transações deste arquivo. Tente uma imagem mais nítida ou envie CSV/OFX do banco.");
    }
    throw e;
  }
}

async function aiCategorize(txns: { description: string }[]): Promise<Array<{ category: string; subcategory?: string; confidence: number }>> {
  if (txns.length === 0) return [];
  const { getAiProvider, CHAT_MODEL } = await import("./ai-gateway.server");
  const { generateText, Output } = await import("ai");
  const provider = getAiProvider();
  const { output } = await generateText({
    model: provider(CHAT_MODEL),
    output: Output.object({
      schema: z.object({
        results: z.array(z.object({
          category: z.string(),
          subcategory: z.string().optional(),
          confidence: z.number().min(0).max(1),
        })),
      }),
    }),
    messages: [
      {
        role: "system",
        content: "Você categoriza transações financeiras em português. Use APENAS uma das categorias: Alimentação, Mercado, Delivery, Restaurante, Transporte, Combustível, Saúde, Academia, Farmácia, Educação, Trabalho, Assinaturas, Streaming, Compras, Moradia, Energia, Água, Internet, Telefone, Impostos, Viagem, Lazer, Investimentos, Reserva, Outros. Responda na mesma ordem do input.",
      },
      {
        role: "user",
        content: `Categorize estas descrições:\n${txns.map((t, i) => `${i + 1}. ${t.description}`).join("\n")}`,
      },
    ],
  });
  return output.results;
}

function logStep(reqId: string, step: string, info: Record<string, unknown> = {}) {
  console.log(`[import:${reqId}] ${step}`, JSON.stringify(info));
}

export const importFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const reqId = Math.random().toString(36).slice(2, 8);
    const t0 = Date.now();
    const kind = detectKind(data.fileName, data.fileType);
    const sizeKb = Math.round((data.base64.length * 3) / 4 / 1024);
    let step: string = "start";
    let fileRowId: string | null = null;

    const failHere = async (err: unknown): Promise<never> => {
      const msg = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? err.stack : undefined;
      console.error(`[import:${reqId}] FAILED at step="${step}" message="${msg}"`, stack ?? "");
      if (fileRowId) {
        await supabase.from("uploaded_files").update({
          processed: true,
          observations: `Falhou na etapa [${step}]: ${msg}`.slice(0, 500),
        }).eq("id", fileRowId).then(() => {}, (e) => console.error(`[import:${reqId}] could not persist failure`, e));
      }
      throw new Error(`[${step}] ${msg}`);
    };

    try {
      logStep(reqId, "start", { fileName: data.fileName, mime: data.fileType, kind, sizeKb, userId });

      // 1. Register the upload
      step = "register-upload";
      const { data: fileRow, error: fileErr } = await supabase
        .from("uploaded_files")
        .insert({ user_id: userId, file_name: data.fileName, file_type: kind, processed: false })
        .select("id, import_batch")
        .single();
      if (fileErr || !fileRow) throw new Error(fileErr?.message ?? "Falha ao registrar arquivo no banco");
      fileRowId = fileRow.id;
      logStep(reqId, "registered", { fileId: fileRow.id, batch: fileRow.import_batch });

      // 2. Detect kind / validate
      step = "detect-kind";
      if (kind === "unknown") {
        throw new Error(`Tipo de arquivo não suportado (nome="${data.fileName}", mime="${data.fileType}"). Use OFX, CSV, XLSX, PDF ou imagem.`);
      }

      // 3. Parse
      step = `parse-${kind}`;
      const { parseCSV, parseOFX, parseXLSX } = await import("./parsers.server");
      let raw: ParsedTxn[] = [];
      const tParse = Date.now();
      if (kind === "csv") raw = parseCSV(decodeBase64ToString(data.base64));
      else if (kind === "ofx") raw = parseOFX(decodeBase64ToString(data.base64));
      else if (kind === "xlsx") raw = parseXLSX(decodeBase64ToArrayBuffer(data.base64));
      else if (kind === "pdf" || kind === "image") raw = await extractFromImageOrPdf(data.base64, data.fileType);
      logStep(reqId, "parsed", { count: raw.length, ms: Date.now() - tParse });

      if (raw.length === 0) {
        step = "no-transactions";
        await supabase.from("uploaded_files").update({
          processed: true,
          observations: "Nenhuma transação encontrada no arquivo.",
        }).eq("id", fileRow.id);
        logStep(reqId, "done-empty", { ms: Date.now() - t0 });
        return { imported: 0, fileId: fileRow.id, reqId, step: "no-transactions" };
      }

      // 4. Load category rules
      step = "load-rules";
      const { data: rules, error: rulesErr } = await supabase
        .from("category_rules")
        .select("merchant_pattern, category, subcategory, confidence")
        .eq("user_id", userId);
      if (rulesErr) throw new Error(`Erro ao carregar regras: ${rulesErr.message}`);
      logStep(reqId, "rules-loaded", { ruleCount: rules?.length ?? 0 });

      // 5. Categorize (rules + heuristics)
      step = "categorize-heuristic";
      const { heuristicCategory } = await import("./categorize.server");
      type Enriched = ParsedTxn & { category: string; subcategory?: string; confidence: number };
      const enriched: Enriched[] = [];
      const needAi: number[] = [];
      raw.forEach((t, i) => {
        const desc = t.description.toUpperCase();
        let matched: { category: string; subcategory?: string; confidence: number } | null = null;
        if (rules) {
          for (const r of rules) {
            if (desc.includes(r.merchant_pattern.toUpperCase())) {
              matched = { category: r.category, subcategory: r.subcategory ?? undefined, confidence: Number(r.confidence) };
              break;
            }
          }
        }
        if (!matched) matched = heuristicCategory(t.description);
        if (matched) enriched.push({ ...t, ...matched });
        else { enriched.push({ ...t, category: "Outros", confidence: 0.3 }); needAi.push(i); }
      });
      logStep(reqId, "heuristic-done", { total: enriched.length, needAi: needAi.length });

      // 6. AI fallback categorization
      if (needAi.length > 0 && needAi.length <= 100) {
        step = "categorize-ai";
        const tAi = Date.now();
        try {
          const aiResults = await aiCategorize(needAi.map((i) => ({ description: enriched[i].description })));
          needAi.forEach((idx, j) => {
            const r = aiResults[j];
            if (r) {
              enriched[idx].category = r.category;
              enriched[idx].subcategory = r.subcategory;
              enriched[idx].confidence = r.confidence;
            }
          });
          logStep(reqId, "ai-categorize-done", { count: aiResults.length, ms: Date.now() - tAi });
        } catch (e) {
          // Não derruba o import — apenas registra
          console.warn(`[import:${reqId}] AI categorize falhou (mantendo "Outros"):`, e);
        }
      }

      // 7. Insert transactions
      step = "insert-transactions";
      const rows = enriched.map((t) => ({
        user_id: userId,
        date: t.date,
        description: t.description,
        merchant: t.merchant ?? t.description.slice(0, 60),
        amount: t.amount,
        transaction_type: t.transaction_type,
        category: t.category,
        subcategory: t.subcategory,
        source_file: data.fileName,
        import_batch: fileRow.import_batch,
        confidence: t.confidence,
      }));
      const tIns = Date.now();
      const { error: insertErr } = await supabase.from("transactions").insert(rows);
      if (insertErr) throw new Error(`Erro ao salvar transações: ${insertErr.message}`);
      logStep(reqId, "inserted", { count: rows.length, ms: Date.now() - tIns });

      // 8. Finalize
      step = "finalize";
      await supabase.from("uploaded_files").update({
        processed: true,
        records_found: rows.length,
        observations: `${rows.length} transações importadas`,
      }).eq("id", fileRow.id);
      logStep(reqId, "done", { imported: rows.length, totalMs: Date.now() - t0 });

      return { imported: rows.length, fileId: fileRow.id, reqId, step: "done" };
    } catch (e) {
      return failHere(e);
    }
  });


export const listUploads = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("uploaded_files")
      .select("*")
      .eq("user_id", context.userId)
      .order("upload_date", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
