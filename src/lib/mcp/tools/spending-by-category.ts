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
  name: "spending_by_category",
  title: "Spending by category",
  description: "Return total spent per category over the last N days for the signed-in user (debit transactions only).",
  inputSchema: {
    days: z.number().int().min(1).max(3650).default(30).describe("How many days back to aggregate. Default 30."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ days }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const since = new Date();
    since.setDate(since.getDate() - days);
    const { data, error } = await supabaseForUser(ctx)
      .from("transactions")
      .select("category, amount, transaction_type")
      .eq("user_id", ctx.getUserId()!)
      .eq("transaction_type", "debit")
      .gte("date", since.toISOString().slice(0, 10));
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const agg: Record<string, number> = {};
    for (const r of data ?? []) agg[r.category] = (agg[r.category] ?? 0) + Number(r.amount);
    const rows = Object.entries(agg)
      .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);
    return {
      content: [{ type: "text", text: JSON.stringify(rows) }],
      structuredContent: { days, rows },
    };
  },
});
