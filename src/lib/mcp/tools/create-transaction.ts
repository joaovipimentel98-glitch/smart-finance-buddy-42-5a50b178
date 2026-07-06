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
  name: "create_transaction",
  title: "Create transaction",
  description: "Insert a new transaction for the signed-in user.",
  inputSchema: {
    date: z.string().describe("ISO date YYYY-MM-DD."),
    description: z.string().trim().min(1).describe("Description of the transaction."),
    amount: z.number().positive().describe("Positive amount in the account's currency."),
    transaction_type: z.enum(["debit", "credit"]).describe("'debit' for expense, 'credit' for income."),
    category: z.string().trim().min(1).default("Outros").describe("Category name."),
    merchant: z.string().trim().optional().describe("Optional merchant/establishment."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  handler: async (input, ctx) => {
    if (!ctx.isAuthenticated()) return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    const { data, error } = await supabaseForUser(ctx)
      .from("transactions")
      .insert({ ...input, user_id: ctx.getUserId()! })
      .select()
      .single();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: `Created transaction ${data.id}` }],
      structuredContent: { row: data },
    };
  },
});
