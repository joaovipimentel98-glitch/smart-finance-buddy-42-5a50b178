import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const DEFAULTS = [
  "Alimentação","Mercado","Delivery","Restaurante","Transporte","Combustível",
  "Saúde","Academia","Farmácia","Educação","Trabalho","Assinaturas","Streaming",
  "Compras","Moradia","Energia","Água","Internet","Telefone","Impostos",
  "Viagem","Lazer","Investimentos","Reserva","Outros",
];

export const listCategories = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("categories")
      .select("id, name, is_default, icon, color")
      .eq("user_id", userId)
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    // Seed defaults on first access if empty
    if (!data || data.length === 0) {
      const rows = DEFAULTS.map((name) => ({ user_id: userId, name, is_default: true }));
      const { data: seeded, error: seedErr } = await supabase
        .from("categories")
        .insert(rows)
        .select("id, name, is_default, icon, color");
      if (seedErr) throw new Error(seedErr.message);
      return seeded ?? [];
    }
    return data;
  });

export const createCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    name: z.string().min(1).max(50),
    icon: z.string().max(40).optional().nullable(),
    color: z.string().max(20).optional().nullable(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const name = data.name.trim();
    const { data: row, error } = await supabase
      .from("categories")
      .insert({ user_id: userId, name, icon: data.icon ?? null, color: data.color ?? null, is_default: false })
      .select("id, name, is_default, icon, color")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const updateCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    name: z.string().min(1).max(50).optional(),
    icon: z.string().max(40).nullable().optional(),
    color: z.string().max(20).nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const patch: { name?: string; icon?: string | null; color?: string | null } = {};
    if (data.name !== undefined) patch.name = data.name.trim();
    if (data.icon !== undefined) patch.icon = data.icon;
    if (data.color !== undefined) patch.color = data.color;

    // If renaming, cascade to transactions and category_rules for this user
    let oldName: string | null = null;
    if (patch.name) {
      const { data: existing } = await supabase
        .from("categories").select("name").eq("id", data.id).eq("user_id", userId).single();
      oldName = existing?.name ?? null;
    }

    const { data: row, error } = await supabase
      .from("categories")
      .update(patch)
      .eq("id", data.id)
      .eq("user_id", userId)
      .select("id, name, is_default, icon, color")
      .single();
    if (error) throw new Error(error.message);

    if (oldName && patch.name && oldName !== patch.name) {
      await supabase.from("transactions").update({ category: patch.name as string })
        .eq("user_id", userId).eq("category", oldName);
      await supabase.from("category_rules").update({ category: patch.name as string })
        .eq("user_id", userId).eq("category", oldName);
    }
    return row;
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    id: z.string().uuid(),
    reassignTo: z.string().min(1).max(50).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: existing } = await supabase
      .from("categories").select("name").eq("id", data.id).eq("user_id", userId).single();
    const target = data.reassignTo?.trim() || "Outros";

    if (existing?.name) {
      await supabase.from("transactions").update({ category: target })
        .eq("user_id", userId).eq("category", existing.name);
      await supabase.from("category_rules").delete()
        .eq("user_id", userId).eq("category", existing.name);
    }

    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
