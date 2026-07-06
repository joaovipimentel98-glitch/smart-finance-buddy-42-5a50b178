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
  name: "list_transactions",
  title: "List transactions",
  description:
    "List the signed-in user's transactions, most recent first. Optionally filter by a text query (matches description) and by number of days back.",
  inputSchema: {
    query: z.string().trim().optional().describe("Optional text to match against transaction description (ILIKE)."),
    days: z.number().int().min(1).max(3650).default(90).describe("How many days back to look. Default 90."),
    limit: z.number().int().min(1).max(200).default(50).describe("Max rows to return. Default 50."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, days, limit }, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const since = new Date();
    since.setDate(since.getDate() - days);
    let q = supabaseForUser(ctx)
      .from("transactions")
      .select("id, date, description, merchant, amount, transaction_type, category")
      .eq("user_id", ctx.getUserId()!)
      .gte("date", since.toISOString().slice(0, 10))
      .order("date", { ascending: false })
      .limit(limit);
    if (query) q = q.ilike("description", `%${query}%`);
    const { data, error } = await q;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { count: data?.length ?? 0, items: data ?? [] },
    };
  },
});
