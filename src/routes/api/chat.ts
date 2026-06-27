import { createFileRoute } from "@tanstack/react-router";
import { convertToModelMessages, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";


export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized", { status: 401 });
        }
        const token = authHeader.slice(7);

        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY!;
        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
        });
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData.user) return new Response("Unauthorized", { status: 401 });
        const userId = userData.user.id;

        const BodySchema = z.object({
          messages: z.array(z.object({
            id: z.string().optional(),
            role: z.string().max(32),
            parts: z.array(z.any()).max(50).optional(),
          }).passthrough()).max(50).default([]),
        });
        let parsedBody: z.infer<typeof BodySchema>;
        try {
          const raw = await request.json();
          parsedBody = BodySchema.parse(raw);
        } catch {
          return new Response("Payload inválido ou excede limites (máx 50 mensagens).", { status: 400 });
        }
        const messages = parsedBody.messages as unknown as UIMessage[];


        const { getChatModels, redactSecrets } = await import("@/lib/ai-gateway.server");
        const candidates = getChatModels();

        const tools = {
          getSpendingByCategory: tool({
            description: "Retorna total gasto por categoria nos últimos N dias.",
            inputSchema: z.object({ days: z.number().int().min(1).max(3650).default(30) }),
            execute: async ({ days }) => {
              const since = new Date(); since.setDate(since.getDate() - days);
              const { data } = await supabase
                .from("transactions").select("category, amount, transaction_type")
                .eq("user_id", userId).eq("transaction_type", "debit")
                .gte("date", since.toISOString().slice(0, 10));
              const agg: Record<string, number> = {};
              for (const r of data ?? []) agg[r.category] = (agg[r.category] ?? 0) + Number(r.amount);
              return Object.entries(agg).map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
                .sort((a, b) => b.total - a.total);
            },
          }),
          getTopMerchants: tool({
            description: "Retorna os principais estabelecimentos por gasto nos últimos N dias.",
            inputSchema: z.object({ days: z.number().int().min(1).max(3650).default(30), limit: z.number().int().min(1).max(50).default(10) }),
            execute: async ({ days, limit }) => {
              const since = new Date(); since.setDate(since.getDate() - days);
              const { data } = await supabase
                .from("transactions").select("merchant, description, amount, transaction_type")
                .eq("user_id", userId).eq("transaction_type", "debit")
                .gte("date", since.toISOString().slice(0, 10));
              const agg: Record<string, number> = {};
              for (const r of data ?? []) {
                const k = r.merchant ?? r.description;
                agg[k] = (agg[k] ?? 0) + Number(r.amount);
              }
              return Object.entries(agg).map(([merchant, total]) => ({ merchant, total: Math.round(total * 100) / 100 }))
                .sort((a, b) => b.total - a.total).slice(0, limit);
            },
          }),
          getMonthlyTotals: tool({
            description: "Retorna totais de receita e despesa por mês.",
            inputSchema: z.object({ months: z.number().int().min(1).max(36).default(6) }),
            execute: async ({ months }) => {
              const since = new Date(); since.setMonth(since.getMonth() - months);
              const { data } = await supabase
                .from("transactions").select("date, amount, transaction_type")
                .eq("user_id", userId).gte("date", since.toISOString().slice(0, 10));
              const agg: Record<string, { income: number; expense: number }> = {};
              for (const r of data ?? []) {
                const m = r.date.slice(0, 7);
                agg[m] ||= { income: 0, expense: 0 };
                if (r.transaction_type === "credit") agg[m].income += Number(r.amount);
                else agg[m].expense += Number(r.amount);
              }
              return Object.entries(agg).map(([month, v]) => ({ month, income: Math.round(v.income * 100) / 100, expense: Math.round(v.expense * 100) / 100, balance: Math.round((v.income - v.expense) * 100) / 100 }))
                .sort((a, b) => a.month.localeCompare(b.month));
            },
          }),
          searchTransactions: tool({
            description: "Busca transações por texto na descrição (ILIKE). Útil para perguntas como 'quanto gastei com iFood'.",
            inputSchema: z.object({ query: z.string().min(1), days: z.number().int().min(1).max(3650).default(365) }),
            execute: async ({ query, days }) => {
              const since = new Date(); since.setDate(since.getDate() - days);
              const { data } = await supabase
                .from("transactions").select("date, description, amount, transaction_type, category")
                .eq("user_id", userId).gte("date", since.toISOString().slice(0, 10))
                .ilike("description", `%${query}%`).order("date", { ascending: false }).limit(100);
              const total = (data ?? []).reduce((s, r) => s + (r.transaction_type === "debit" ? Number(r.amount) : 0), 0);
              return { count: data?.length ?? 0, total_debit: Math.round(total * 100) / 100, items: data ?? [] };
            },
          }),
        };

        // Try providers in order; on synchronous setup error, fall back.
        let lastErr: unknown = null;
        for (const { label, model } of candidates) {
          try {
            const result = streamText({
              model,
              system: "Você é um consultor financeiro pessoal em português brasileiro. Use as ferramentas para consultar os dados reais do usuário antes de responder. Valores em reais (R$). Seja direto e específico. Sempre responda em português.",
              messages: await convertToModelMessages(messages),
              tools,
              stopWhen: ({ steps }) => steps.length >= 8,
              onError: (e) => console.error(`[chat] ${label} stream error:`, redactSecrets(e instanceof Error ? e.message : String(e))),
            });
            return result.toUIMessageStreamResponse({ originalMessages: messages });
          } catch (e) {
            const safe = redactSecrets(e instanceof Error ? e.message : String(e));
            console.error(`[chat] provider ${label} failed:`, safe);
            lastErr = safe;
          }
        }
        return new Response(redactSecrets(`Todos os provedores falharam: ${lastErr ?? ""}`), { status: 502 });
      },
    },
  },
});
