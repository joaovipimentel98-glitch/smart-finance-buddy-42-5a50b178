import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const toggleInvestment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), isInvestment: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("transactions")
      .update({ is_investment: data.isInvestment })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listInvestments = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transactions")
      .select("*")
      .eq("user_id", context.userId)
      .eq("is_investment", true)
      .order("date", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getInvestmentsSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("transactions")
      .select("amount, category, merchant, date, transaction_type")
      .eq("user_id", context.userId)
      .eq("is_investment", true);
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    let totalAportado = 0;
    let totalResgatado = 0;
    const byCategory: Record<string, number> = {};
    const byMerchant: Record<string, number> = {};
    const byMonth: Record<string, number> = {};

    for (const r of rows) {
      const v = Number(r.amount);
      const signed = r.transaction_type === "debit" ? v : -v; // debit = aporte (saiu da conta)
      if (signed >= 0) totalAportado += signed;
      else totalResgatado += -signed;
      byCategory[r.category] = (byCategory[r.category] ?? 0) + signed;
      const m = r.merchant ?? r.category;
      byMerchant[m] = (byMerchant[m] ?? 0) + signed;
      const month = r.date.slice(0, 7);
      byMonth[month] = (byMonth[month] ?? 0) + signed;
    }

    return {
      totalAportado: Math.round(totalAportado * 100) / 100,
      totalResgatado: Math.round(totalResgatado * 100) / 100,
      saldoLiquido: Math.round((totalAportado - totalResgatado) * 100) / 100,
      count: rows.length,
      byCategory: Object.entries(byCategory)
        .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
        .sort((a, b) => b.total - a.total),
      byMerchant: Object.entries(byMerchant)
        .map(([merchant, total]) => ({ merchant, total: Math.round(total * 100) / 100 }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 10),
      byMonth: Object.entries(byMonth)
        .map(([month, total]) => ({ month, total: Math.round(total * 100) / 100 }))
        .sort((a, b) => a.month.localeCompare(b.month)),
    };
  });

const ManualTxnSchema = z.object({
  date: z.string(),
  description: z.string().min(1),
  amount: z.number().positive(),
  transaction_type: z.enum(["credit", "debit"]).default("debit"),
  category: z.string().default("Outros"),
  merchant: z.string().optional(),
  is_investment: z.boolean().default(false),
  source: z.string().default("manual"),
});

export const createManualTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      cardLabel: z.string().optional(),
      txns: z.array(ManualTxnSchema).min(1).max(200),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const rows = data.txns.map((t) => ({
      user_id: context.userId,
      date: t.date,
      description: t.description,
      merchant: t.merchant ?? data.cardLabel ?? t.description.slice(0, 60),
      amount: t.amount,
      transaction_type: t.transaction_type,
      category: t.category,
      source: t.source,
      is_investment: t.is_investment,
      confidence: 1,
    }));
    const { error } = await context.supabase.from("transactions").insert(rows);
    if (error) throw new Error(error.message);
    return { imported: rows.length };
  });
