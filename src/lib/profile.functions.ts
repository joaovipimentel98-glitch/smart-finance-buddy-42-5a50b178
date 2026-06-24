import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ProfileInput = z.object({
  display_name: z.string().trim().max(80).nullable().optional(),
  avatar_url: z.string().trim().max(500).nullable().optional(),
  ai_provider: z.enum(["lovable", "openai"]).optional(),
  ai_tone: z.enum(["neutral", "friendly", "direct", "coach"]).optional(),
  banks: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  monthly_budget: z.number().nonnegative().nullable().optional(),
  alert_threshold: z.number().nonnegative().nullable().optional(),
  notify_spending: z.boolean().optional(),
});

export const getProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (data) return data;
    const { data: created, error: insErr } = await supabase
      .from("profiles")
      .insert({ id: userId })
      .select("*")
      .single();
    if (insErr) throw new Error(insErr.message);
    return created;
  });

export const updateProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => ProfileInput.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: updated, error } = await supabase
      .from("profiles")
      .upsert({ id: userId, ...data })
      .eq("id", userId)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return updated;
  });

export const getAvatarSignedUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ path: z.string().min(1).max(300) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    if (!data.path.startsWith(`${userId}/`)) throw new Error("Forbidden");
    const { data: signed, error } = await supabase.storage
      .from("avatars")
      .createSignedUrl(data.path, 60 * 60);
    if (error) throw new Error(error.message);
    return { url: signed.signedUrl };
  });
