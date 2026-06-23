import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      limit: z.number().int().min(1).max(500).default(100),
      category: z.string().optional(),
      search: z.string().optional(),
    }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    let q = context.supabase
      .from("transactions")
      .select("*")
      .eq("user_id", context.userId)
      .order("date", { ascending: false })
      .limit(data.limit);
    if (data.category) q = q.eq("category", data.category);
    if (data.search) q = q.ilike("description", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const updateTransactionCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      id: z.string().uuid(),
      category: z.string().min(1),
      subcategory: z.string().optional(),
      createRule: z.boolean().default(true),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: tx, error: getErr } = await supabase
      .from("transactions")
      .select("description, merchant")
      .eq("id", data.id)
      .eq("user_id", userId)
      .single();
    if (getErr || !tx) throw new Error(getErr?.message ?? "Transação não encontrada");

    const { error } = await supabase
      .from("transactions")
      .update({ category: data.category, subcategory: data.subcategory, confidence: 1 })
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);

    if (data.createRule) {
      // Extract a token from merchant/description for the rule pattern
      const source = (tx.merchant ?? tx.description ?? "").toUpperCase();
      const token = source.split(/[\s\-*]+/).filter((w) => w.length >= 3).slice(0, 1)[0];
      if (token) {
        await supabase.from("category_rules").upsert(
          {
            user_id: userId,
            merchant_pattern: token,
            category: data.category,
            subcategory: data.subcategory,
            confidence: 1,
          },
          { onConflict: "user_id,merchant_pattern" },
        );
      }
    }
    return { ok: true };
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("transactions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("categories")
      .select("name")
      .eq("user_id", context.userId)
      .order("name");
    if (error) throw new Error(error.message);
    return data?.map((c) => c.name) ?? [];
  });
