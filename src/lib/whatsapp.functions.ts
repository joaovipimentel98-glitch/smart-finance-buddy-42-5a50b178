import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function normalizeE164(input: string): string | null {
  const digits = input.replace(/[^\d]/g, "");
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}

export const getWhatsAppStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("whatsapp_e164, whatsapp_verified_at")
      .eq("id", userId)
      .maybeSingle();
    const { data: code } = await supabase
      .from("whatsapp_pairing_codes")
      .select("code, expires_at")
      .eq("user_id", userId)
      .is("consumed_at", null)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      linked_e164: profile?.whatsapp_e164 ?? null,
      verified_at: profile?.whatsapp_verified_at ?? null,
      pending_code: code?.code ?? null,
      pending_expires_at: code?.expires_at ?? null,
    };
  });

export const createPairingCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    // Invalidate previous unconsumed codes
    await supabase
      .from("whatsapp_pairing_codes")
      .update({ consumed_at: new Date().toISOString() })
      .eq("user_id", userId)
      .is("consumed_at", null);
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const { error } = await supabase
      .from("whatsapp_pairing_codes")
      .insert({ user_id: userId, code, expires_at: expiresAt });
    if (error) throw new Error(error.message);
    return { code, expires_at: expiresAt };
  });

export const unlinkWhatsApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ whatsapp_e164: null, whatsapp_verified_at: null })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setWhatsAppNumber = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ phone: z.string().min(8).max(20) }).parse(d))
  .handler(async ({ data, context }) => {
    const e164 = normalizeE164(data.phone);
    if (!e164) throw new Error("Número inválido. Use DDI+DDD+número (ex.: +5511999998888).");
    // Note: we don't set whatsapp_e164 here — that happens when the pairing
    // code is confirmed via the webhook. This just persists the "expected"
    // number so the UI shows what to send from.
    return { normalized: e164 };
  });
