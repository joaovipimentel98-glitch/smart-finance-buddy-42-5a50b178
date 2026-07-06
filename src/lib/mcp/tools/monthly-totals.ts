import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";
import type { Database } from "@/integrations/supabase/types";

function supabaseForUser(ctx: ToolContext) {
  return createClient<Database>(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "monthly_totals",
  title: "Monthly totals",
  description: "Return income, expense, and balance per month over the last N months for the signed-in user.",
  inputSchema: {
    months: z.number().int().min(1).max(36).default(6).describe("How many months back to aggregate. Default 6."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ months }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const { data, error } = await supabaseForUser(ctx)
      .from("transactions")
      .select("date, amount, transaction_type")
      .eq("user_id", ctx.getUserId()!)
      .gte("date", since.toISOString().slice(0, 10));
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const agg: Record<string, { income: number; expense: number }> = {};
    for (const r of data ?? []) {
      const m = r.date.slice(0, 7);
      agg[m] ||= { income: 0, expense: 0 };
      if (r.transaction_type === "credit") agg[m].income += Number(r.amount);
      else agg[m].expense += Number(r.amount);
    }
    const rows = Object.entries(agg)
      .map(([month, v]) => ({
        month,
        income: Math.round(v.income * 100) / 100,
        expense: Math.round(v.expense * 100) / 100,
        balance: Math.round((v.income - v.expense) * 100) / 100,
      }))
      .sort((a, b) => a.month.localeCompare(b.month));
    return {
      content: [{ type: "text", text: JSON.stringify(rows) }],
      structuredContent: { months, rows },
    };
  },
});
