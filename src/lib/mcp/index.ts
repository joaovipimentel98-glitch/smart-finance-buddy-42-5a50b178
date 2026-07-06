import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listTransactions from "./tools/list-transactions";
import spendingByCategory from "./tools/spending-by-category";
import monthlyTotals from "./tools/monthly-totals";
import createTransaction from "./tools/create-transaction";

// The OAuth issuer MUST be the direct Supabase host; the published SUPABASE_URL
// is rewritten to a `.lovable.cloud` proxy and would fail RFC 8414 issuer checks.
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "finance-ai-mcp",
  title: "Finance AI",
  version: "0.1.0",
  instructions:
    "Tools to read and manage the signed-in user's personal finance data: list transactions, aggregate spending by category, monthly income/expense totals, and create new transactions.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listTransactions, spendingByCategory, monthlyTotals, createTransaction],
});
