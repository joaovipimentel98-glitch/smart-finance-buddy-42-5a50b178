import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type BudgetRow = {
  id: string;
  category: string;
  monthly_amount: number;
};

export const listBudgets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("budgets")
      .select("id, category, monthly_amount")
      .eq("user_id", context.userId)
      .order("category", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((b) => ({
      ...b,
      monthly_amount: Number(b.monthly_amount),
    })) as BudgetRow[];
  });

export const upsertBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        category: z.string().trim().min(1),
        monthly_amount: z.number().min(0),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("budgets").upsert(
      {
        user_id: context.userId,
        category: data.category,
        monthly_amount: data.monthly_amount,
      },
      { onConflict: "user_id,category" },
    );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBudget = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("budgets")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getBudgetProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({ month: z.string().regex(/^\d{4}-\d{2}$/).optional() })
      .parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    const now = new Date();
    const ym =
      data.month ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const [y, m] = ym.split("-").map(Number);
    const start = `${ym}-01`;
    const endDate = new Date(y, m, 1); // first day of next month
    const end = endDate.toISOString().slice(0, 10);

    const [budgetsRes, txRes] = await Promise.all([
      context.supabase
        .from("budgets")
        .select("id, category, monthly_amount")
        .eq("user_id", context.userId),
      context.supabase
        .from("transactions")
        .select("category, amount, transaction_type, is_investment, date")
        .eq("user_id", context.userId)
        .eq("transaction_type", "debit")
        .gte("date", start)
        .lt("date", end),
    ]);
    if (budgetsRes.error) throw new Error(budgetsRes.error.message);
    if (txRes.error) throw new Error(txRes.error.message);

    const spentByCat: Record<string, number> = {};
    for (const t of txRes.data ?? []) {
      if (t.is_investment) continue;
      spentByCat[t.category] = (spentByCat[t.category] ?? 0) + Number(t.amount);
    }

    const rows = (budgetsRes.data ?? []).map((b) => {
      const planned = Number(b.monthly_amount);
      const spent = spentByCat[b.category] ?? 0;
      return {
        id: b.id,
        category: b.category,
        planned,
        spent,
        remaining: planned - spent,
        pct: planned > 0 ? Math.min(999, (spent / planned) * 100) : 0,
        over: planned > 0 && spent > planned,
      };
    });

    return {
      month: ym,
      rows,
      totals: {
        planned: rows.reduce((s, r) => s + r.planned, 0),
        spent: rows.reduce((s, r) => s + r.spent, 0),
      },
    };
  });
