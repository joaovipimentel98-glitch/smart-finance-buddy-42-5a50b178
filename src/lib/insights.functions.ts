import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listInsights = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("financial_insights")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const generateInsights = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Build a summary of last 90 days
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const sinceIso = since.toISOString().slice(0, 10);
    const { data: txns } = await supabase
      .from("transactions")
      .select("date, amount, transaction_type, category, description")
      .eq("user_id", userId)
      .gte("date", sinceIso);

    if (!txns || txns.length === 0) {
      return { generated: 0, message: "Importe transações para gerar insights." };
    }

    // Aggregate per category & per month
    const cat: Record<string, number> = {};
    const monthCat: Record<string, Record<string, number>> = {};
    let income = 0, expense = 0;
    for (const t of txns) {
      const amt = Number(t.amount);
      const month = t.date.slice(0, 7);
      if (t.transaction_type === "credit") income += amt;
      else {
        expense += amt;
        cat[t.category] = (cat[t.category] ?? 0) + amt;
        monthCat[month] ||= {};
        monthCat[month][t.category] = (monthCat[month][t.category] ?? 0) + amt;
      }
    }
    const topCats = Object.entries(cat).sort((a, b) => b[1] - a[1]).slice(0, 8);

    const summary = {
      period_days: 90,
      total_income: Math.round(income),
      total_expense: Math.round(expense),
      balance: Math.round(income - expense),
      top_categories: topCats.map(([name, value]) => ({ name, value: Math.round(value) })),
      monthly_by_category: Object.fromEntries(
        Object.entries(monthCat).map(([m, c]) => [m, Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v)]))]),
      ),
    };


    const ALLOWED_SEVERITY = ["info", "warning", "critical", "success"] as const;
    type Severity = (typeof ALLOWED_SEVERITY)[number];

    const InsightItemSchema = z.object({
      type: z.string().trim().min(1).max(40).default("geral"),
      severity: z.string().trim().toLowerCase().default("info"),
      title: z.string().trim().min(3).max(120),
      description: z.string().trim().min(10).max(500),
    });
    const InsightSchema = z.object({
      insights: z.array(InsightItemSchema).min(1).max(12),
    });

    // ---- Robust JSON extraction & repair ----
    function extractJson(raw: string): string {
      let s = raw.replace(/^\uFEFF/, "").trim();
      // strip code fences (```json ... ``` or ``` ... ```)
      s = s.replace(/^```(?:json|JSON)?\s*/m, "").replace(/```$/m, "").trim();
      // find first { or [ and matching last } or ]
      const firstObj = s.indexOf("{");
      const firstArr = s.indexOf("[");
      let start = -1;
      let open = "{", close = "}";
      if (firstObj !== -1 && (firstArr === -1 || firstObj < firstArr)) {
        start = firstObj; open = "{"; close = "}";
      } else if (firstArr !== -1) {
        start = firstArr; open = "["; close = "]";
      }
      if (start === -1) throw new Error("Nenhum JSON encontrado na resposta da IA.");
      const end = s.lastIndexOf(close);
      if (end < start) throw new Error("JSON incompleto na resposta da IA.");
      let body = s.slice(start, end + 1);

      // Detect truncation indicators
      if (/\.\.\.\s*$/.test(body) || /\u2026\s*$/.test(body)) {
        throw new Error("Resposta da IA aparenta estar truncada.");
      }

      // Brace/bracket balance check
      const openCount = (body.match(/[{\[]/g) || []).length;
      const closeCount = (body.match(/[}\]]/g) || []).length;
      if (openCount !== closeCount) {
        throw new Error(`JSON desbalanceado (${openCount} aberturas / ${closeCount} fechamentos).`);
      }

      // Repair common issues: trailing commas, control chars, smart quotes
      body = body
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
        .replace(/,(\s*[}\]])/g, "$1")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2018\u2019]/g, "'");

      // If model wrapped array, coerce to { insights: [...] }
      if (open === "[") body = `{"insights":${body}}`;
      return body;
    }

    const { withProviderFallback } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");

    const callModel = async () =>
      withProviderFallback(async (model) =>
        (await generateText({
          model,
          messages: [
            {
              role: "system",
              content:
                "Você é um consultor financeiro pessoal. Analise dados reais e gere insights acionáveis em português brasileiro. Foque em: hábitos de consumo, desperdícios, crescimentos suspeitos, oportunidades de economia e padrões. Seja específico — cite categorias e valores em reais (R$).\n\n" +
                "RESPONDA EXCLUSIVAMENTE COM JSON VÁLIDO, sem markdown, sem cercas de código, sem texto antes ou depois.\n" +
                'Formato exato: {"insights":[{"type":"economia","severity":"info","title":"...","description":"..."}]}\n' +
                "severity ∈ [info, warning, critical, success]. title 3–120 chars. description 10–500 chars.",
            },
            {
              role: "user",
              content: `Resumo (últimos 90 dias):\n${JSON.stringify(summary)}\n\nGere de 4 a 6 insights. Apenas JSON.`,
            },
          ],
        })).text,
      );

    // ---- Try once, retry once on validation failure ----
    let parsed: z.infer<typeof InsightSchema> | null = null;
    let lastErr: unknown = null;
    for (let attempt = 0; attempt < 2 && !parsed; attempt++) {
      try {
        const text = await callModel();
        if (!text || text.trim().length === 0) throw new Error("Resposta vazia da IA.");
        const jsonStr = extractJson(text);
        const json = JSON.parse(jsonStr);
        const result = InsightSchema.safeParse(json);
        if (!result.success) {
          const issues = result.error.issues.slice(0, 3).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
          throw new Error(`Schema inválido: ${issues}`);
        }
        parsed = result.data;
      } catch (e) {
        lastErr = e;
        console.error(`[insights] tentativa ${attempt + 1} falhou:`, e);
      }
    }

    if (!parsed) {
      throw new Error(
        `A IA não retornou um JSON válido após 2 tentativas: ${lastErr instanceof Error ? lastErr.message : String(lastErr)}`,
      );
    }

    // Final normalization + safety filter
    const seen = new Set<string>();
    const rows = parsed.insights
      .map((i) => ({
        type: i.type.slice(0, 40),
        severity: (ALLOWED_SEVERITY as readonly string[]).includes(i.severity)
          ? (i.severity as Severity)
          : ("info" as Severity),
        title: i.title.slice(0, 120),
        description: i.description.slice(0, 500),
        user_id: userId,
      }))
      .filter((i) => {
        const key = i.title.toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, 8);

    if (rows.length === 0) {
      throw new Error("Nenhum insight válido após validação.");
    }

    await supabase.from("financial_insights").delete().eq("user_id", userId);
    const { error } = await supabase.from("financial_insights").insert(rows);
    if (error) throw new Error(error.message);
    return { generated: rows.length };
  });
