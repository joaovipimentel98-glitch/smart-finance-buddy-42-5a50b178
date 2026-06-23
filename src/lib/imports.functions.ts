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

export const importFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => ImportInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const kind = detectKind(data.fileName, data.fileType);

    // 1. Register the upload
    const { data: fileRow, error: fileErr } = await supabase
      .from("uploaded_files")
      .insert({
        user_id: userId,
        file_name: data.fileName,
        file_type: kind,
        processed: false,
      })
      .select("id, import_batch")
      .single();
    if (fileErr || !fileRow) throw new Error(fileErr?.message ?? "Failed to register file");

    // 2. Parse
    const { parseCSV, parseOFX, parseXLSX } = await import("./parsers.server");
    let raw: ParsedTxn[] = [];
    try {
      if (kind === "csv") raw = parseCSV(decodeBase64ToString(data.base64));
      else if (kind === "ofx") raw = parseOFX(decodeBase64ToString(data.base64));
      else if (kind === "xlsx") raw = parseXLSX(decodeBase64ToArrayBuffer(data.base64));
      else if (kind === "pdf" || kind === "image") raw = await extractFromImageOrPdf(data.base64, data.fileType);
      else throw new Error("Tipo de arquivo não suportado");
    } catch (e) {
      await supabase.from("uploaded_files").update({
        processed: true,
        observations: `Erro ao processar: ${e instanceof Error ? e.message : String(e)}`,
      }).eq("id", fileRow.id);
      throw e;
    }

    if (raw.length === 0) {
      await supabase.from("uploaded_files").update({
        processed: true,
        observations: "Nenhuma transação encontrada.",
      }).eq("id", fileRow.id);
      return { imported: 0, fileId: fileRow.id };
    }

    // 3. Apply category rules (per-user)
    const { data: rules } = await supabase
      .from("category_rules")
      .select("merchant_pattern, category, subcategory, confidence")
      .eq("user_id", userId);

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
      if (matched) {
        enriched.push({ ...t, ...matched });
      } else {
        enriched.push({ ...t, category: "Outros", confidence: 0.3 });
        needAi.push(i);
      }
    });

    // 4. AI categorize remainder (batched)
    if (needAi.length > 0 && needAi.length <= 100) {
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
      } catch (e) {
        console.error("AI categorize failed", e);
      }
    }

    // 5. Insert
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
    const { error: insertErr } = await supabase.from("transactions").insert(rows);
    if (insertErr) {
      await supabase.from("uploaded_files").update({
        processed: true,
        observations: `Erro ao salvar: ${insertErr.message}`,
      }).eq("id", fileRow.id);
      throw new Error(insertErr.message);
    }

    await supabase.from("uploaded_files").update({
      processed: true,
      records_found: rows.length,
      observations: `${rows.length} transações importadas`,
    }).eq("id", fileRow.id);

    return { imported: rows.length, fileId: fileRow.id };
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
