import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Txn = {
  date: string;
  amount: number;
  transaction_type: "credit" | "debit";
  category: string;
  description: string;
  merchant: string | null;
  is_investment?: boolean;
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

const dashboardInputSchema = z
  .object({
    days: z.number().int().min(1).max(3650).optional(),
    startDate: z.string().date().optional(),
    endDate: z.string().date().optional(),
  })
  .refine(
    (data) =>
      data.days !== undefined ||
      (data.startDate !== undefined && data.endDate !== undefined),
    { message: "Informe days ou o par startDate/endDate" },
  );

export const getDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => dashboardInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const since =
      data.days !== undefined ? daysAgo(data.days) : (data.startDate as string);
    const until =
      data.days !== undefined
        ? new Date().toISOString().slice(0, 10)
        : (data.endDate as string);

    const { data: rows, error } = await context.supabase
      .from("transactions")
      .select("date, amount, transaction_type, category, description, merchant, is_investment")
      .eq("user_id", context.userId)
      .gte("date", since)
      .lte("date", until)
      .order("date", { ascending: true });
    if (error) throw new Error(error.message);
    const txns = (rows ?? []) as Txn[];

    let totalIncome = 0;
    let totalExpense = 0;
    const byCategory: Record<string, number> = {};
    const byDay: Record<string, { income: number; expense: number }> = {};

    for (const t of txns) {
      const amt = Number(t.amount);
      if (t.is_investment) continue;
      if (t.transaction_type === "credit") totalIncome += amt;
      else {
        totalExpense += amt;
        byCategory[t.category] = (byCategory[t.category] ?? 0) + amt;
      }
      const day = t.date;
      byDay[day] ||= { income: 0, expense: 0 };
      if (t.transaction_type === "credit") byDay[day].income += amt;
      else byDay[day].expense += amt;
    }

    // Build evolution series (cumulative balance)
    const days = Object.keys(byDay).sort();
    let bal = 0;
    const series = days.map((d) => {
      bal += byDay[d].income - byDay[d].expense;
      return { date: d, income: byDay[d].income, expense: byDay[d].expense, balance: bal };
    });

    const categories = Object.entries(byCategory)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);

    // Month totals (current month)
    const monthStart = new Date();
    monthStart.setDate(1);
    const monthIso = monthStart.toISOString().slice(0, 10);
    let monthIncome = 0;
    let monthExpense = 0;
    for (const t of txns) {
      if (t.date < monthIso) continue;
      if (t.is_investment) continue;
      const a = Number(t.amount);
      if (t.transaction_type === "credit") monthIncome += a;
      else monthExpense += a;
    }
    const monthBalance = monthIncome - monthExpense;

    const topExpenses = txns
      .filter((t) => t.transaction_type === "debit" && !t.is_investment)
      .sort((a, b) => Number(b.amount) - Number(a.amount))
      .slice(0, 10)
      .map((t) => ({
        date: t.date,
        description: t.description,
        merchant: t.merchant,
        category: t.category,
        amount: Number(t.amount),
      }));

    // Score 0-100 heuristic
    const savingsRate = totalIncome > 0 ? Math.max(0, (totalIncome - totalExpense) / totalIncome) : 0;
    const score = Math.round(Math.min(100, savingsRate * 80 + (txns.length > 0 ? 20 : 0)));

    return {
      totals: {
        income: totalIncome,
        expense: totalExpense,
        balance: totalIncome - totalExpense,
        monthIncome,
        monthExpense,
        monthBalance,
        score,
      },
      series,
      categories,
      topExpenses,
      txCount: txns.length,
    };
  });
