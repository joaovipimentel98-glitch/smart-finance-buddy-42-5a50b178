// Public webhook for Meta WhatsApp Cloud API.
// GET: verification handshake. POST: incoming messages.
import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "node:crypto";
import { sendWhatsAppText } from "@/lib/whatsapp/send.server";
import { extractTransactionFromText } from "@/lib/whatsapp/extract.server";
import { redactSecrets } from "@/lib/ai-gateway.server";

const DEFAULT_CATEGORIES = [
  "Alimentação","Mercado","Delivery","Restaurante","Transporte","Combustível",
  "Saúde","Academia","Farmácia","Educação","Trabalho","Assinaturas","Streaming",
  "Compras","Moradia","Energia","Água","Internet","Telefone","Impostos",
  "Viagem","Lazer","Investimentos","Reserva","Outros",
];

function verifySignature(rawBody: string, signature: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signature) return !secret; // if no secret set yet, skip check (dev)
  const expected = "sha256=" + createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
        if (mode === "subscribe" && verifyToken && token === verifyToken && challenge) {
          return new Response(challenge, { status: 200 });
        }
        return new Response("forbidden", { status: 403 });
      },

      POST: async ({ request }) => {
        const rawBody = await request.text();
        const signature = request.headers.get("x-hub-signature-256");
        if (!verifySignature(rawBody, signature)) {
          return new Response("invalid signature", { status: 401 });
        }
        let payload: unknown;
        try { payload = JSON.parse(rawBody); } catch { return new Response("bad json", { status: 400 }); }

        // Always ack fast so Meta doesn't retry; process async.
        processIncoming(payload).catch((e) =>
          console.error("[whatsapp/webhook] process error:", redactSecrets(e instanceof Error ? e.message : String(e))),
        );
        return new Response("ok", { status: 200 });
      },
    },
  },
});

type IncomingMsg = {
  id: string;
  from: string; // digits, no plus
  type: string;
  text?: { body?: string };
};

async function processIncoming(payload: unknown) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const messages: Array<{ msg: IncomingMsg; contactName?: string }> = [];
  const entries = (payload as { entry?: Array<{ changes?: Array<{ value?: { messages?: IncomingMsg[]; contacts?: Array<{ profile?: { name?: string } }> } }> } >; })?.entry ?? [];
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const contactName = value?.contacts?.[0]?.profile?.name;
      for (const m of value?.messages ?? []) {
        messages.push({ msg: m, contactName });
      }
    }
  }

  for (const { msg } of messages) {
    const fromE164 = `+${msg.from}`;
    const body = (msg.text?.body ?? "").trim();

    // Dedupe by wa_message_id (unique constraint).
    const { error: logErr } = await supabaseAdmin.from("whatsapp_messages_log").insert({
      wa_message_id: msg.id,
      from_e164: fromE164,
      direction: "inbound",
      body,
      status: "received",
    });
    if (logErr && !String(logErr.message).toLowerCase().includes("duplicate")) {
      console.error("[whatsapp/webhook] log insert:", redactSecrets(logErr.message));
    }
    if (logErr) continue; // duplicate or failed — skip processing

    // Look up user by linked whatsapp_e164
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, whatsapp_e164")
      .eq("whatsapp_e164", fromE164)
      .maybeSingle();

    let userId = profile?.id ?? null;

    // Pairing flow: message is exactly a 6-digit code.
    const codeMatch = body.match(/^\s*(\d{6})\s*$/);
    if (!userId && codeMatch) {
      const code = codeMatch[1];
      const { data: pairing } = await supabaseAdmin
        .from("whatsapp_pairing_codes")
        .select("id, user_id, expires_at")
        .eq("code", code)
        .is("consumed_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pairing) {
        await supabaseAdmin.from("whatsapp_pairing_codes")
          .update({ consumed_at: new Date().toISOString() })
          .eq("id", pairing.id);
        await supabaseAdmin.from("profiles")
          .update({ whatsapp_e164: fromE164, whatsapp_verified_at: new Date().toISOString() })
          .eq("id", pairing.user_id);
        userId = pairing.user_id;
        await sendReply(fromE164, userId, "✅ Número vinculado! Envie seus gastos assim:\n\n• \"gastei 32 no ifood\"\n• \"uber 18\"\n• \"salário 3500\"");
        continue;
      }
      await sendReply(fromE164, null, "❌ Código inválido ou expirado. Gere um novo em Perfil → WhatsApp.");
      continue;
    }

    if (!userId) {
      await sendReply(fromE164, null, "👋 Olá! Este número não está vinculado. Acesse seu Perfil no Finance AI, gere um código de 6 dígitos e envie apenas o código aqui.");
      continue;
    }

    if (!body) {
      await sendReply(fromE164, userId, "Envie um texto descrevendo o gasto. Ex.: \"almoço 45\".");
      continue;
    }

    // Load user's categories (fallback to defaults)
    const { data: cats } = await supabaseAdmin
      .from("categories").select("name").eq("user_id", userId);
    const categoryNames = (cats ?? []).map((c) => c.name).filter(Boolean);
    const usable = categoryNames.length ? categoryNames : DEFAULT_CATEGORIES;

    const extracted = await extractTransactionFromText(body, usable);
    if (!extracted.is_transaction || !extracted.amount || !extracted.transaction_type) {
      await sendReply(fromE164, userId, "Não entendi como gasto. Tente: \"gastei 25 no uber\" ou \"mercado 180,50\".");
      continue;
    }

    const today = new Date().toISOString().slice(0, 10);
    const category = usable.includes(extracted.category ?? "") ? extracted.category! : "Outros";
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("transactions")
      .insert({
        user_id: userId,
        date: today,
        description: extracted.description ?? body.slice(0, 120),
        amount: Math.abs(extracted.amount),
        transaction_type: extracted.transaction_type,
        category,
        merchant: extracted.merchant ?? null,
        source: "whatsapp",
      })
      .select("id, amount, category, transaction_type, description")
      .single();
    if (insErr) {
      console.error("[whatsapp/webhook] tx insert:", redactSecrets(insErr.message));
      await sendReply(fromE164, userId, "⚠️ Erro ao salvar. Tente novamente.");
      continue;
    }

    const emoji = inserted.transaction_type === "credit" ? "💰" : "💸";
    const fmt = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(inserted.amount));
    await sendReply(
      fromE164,
      userId,
      `${emoji} Registrado: ${fmt}\n${inserted.description}\nCategoria: ${inserted.category}`,
    );
  }
}

async function sendReply(toE164: string, userId: string | null, text: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const result = await sendWhatsAppText(toE164, text);
  await supabaseAdmin.from("whatsapp_messages_log").insert({
    user_id: userId,
    from_e164: toE164,
    direction: "outbound",
    body: text,
    status: result.ok ? "sent" : `failed:${result.error}`,
  });
}
