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
    icon: z.string().optional(),
    color: z.string().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const name = data.name.trim();
    const { data: row, error } = await supabase
      .from("categories")
      .insert({ user_id: userId, name, icon: data.icon, color: data.color, is_default: false })
      .select("id, name, is_default, icon, color")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("categories")
      .delete()
      .eq("id", data.id)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
