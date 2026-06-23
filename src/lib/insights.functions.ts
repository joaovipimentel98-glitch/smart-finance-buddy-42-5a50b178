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

    const { getAiProvider, CHAT_MODEL } = await import("./ai-gateway.server");
    const { generateText } = await import("ai");
    const provider = getAiProvider();

    const InsightSchema = z.object({
      insights: z.array(z.object({
        type: z.string().default("geral"),
        severity: z.string().default("info"),
        title: z.string(),
        description: z.string(),
      })),
    });

    const { text } = await generateText({
      model: provider(CHAT_MODEL),
      messages: [
        {
          role: "system",
          content:
            "Você é um consultor financeiro pessoal. Analise dados reais e gere insights acionáveis em português brasileiro. Foque em: hábitos de consumo, desperdícios, crescimentos suspeitos, oportunidades de economia e padrões. Seja específico — cite categorias e valores em reais (R$).\n\n" +
            'RESPONDA APENAS COM JSON VÁLIDO neste formato exato (sem markdown, sem ```):\n' +
            '{"insights":[{"type":"economia","severity":"info","title":"...","description":"..."}]}\n' +
            "severity deve ser um destes: info, warning, critical, success.",
        },
        {
          role: "user",
          content: `Resumo financeiro do usuário (últimos 90 dias):\n\n${JSON.stringify(summary, null, 2)}\n\nGere de 4 a 6 insights concretos. Cada um curto (1-2 frases na descrição). Apenas JSON.`,
        },
      ],
    });

    // Robust JSON extraction
    let parsed: z.infer<typeof InsightSchema>;
    try {
      let cleaned = text.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
      const start = cleaned.indexOf("{");
      const end = cleaned.lastIndexOf("}");
      if (start === -1 || end === -1) throw new Error("Sem JSON na resposta");
      cleaned = cleaned.slice(start, end + 1).replace(/,\s*}/g, "}").replace(/,\s*]/g, "]");
      parsed = InsightSchema.parse(JSON.parse(cleaned));
    } catch (e) {
      throw new Error(`A IA retornou resposta inválida: ${e instanceof Error ? e.message : String(e)}`);
    }

    const ALLOWED = ["info", "warning", "critical", "success"] as const;
    type Severity = (typeof ALLOWED)[number];
    const rows = parsed.insights
      .filter((i) => i.title && i.description)
      .slice(0, 8)
      .map((i) => ({
        type: i.type || "geral",
        severity: (ALLOWED as readonly string[]).includes(i.severity) ? (i.severity as Severity) : ("info" as Severity),
        title: i.title,
        description: i.description,
        user_id: userId,
      }));

    if (rows.length === 0) throw new Error("Nenhum insight foi gerado pela IA.");

    await supabase.from("financial_insights").delete().eq("user_id", userId);
    const { error } = await supabase.from("financial_insights").insert(rows);
    if (error) throw new Error(error.message);
    return { generated: rows.length };
  });
