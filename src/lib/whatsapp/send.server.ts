// Server-only helper for sending WhatsApp messages via Meta Graph API.
import { redactSecrets } from "@/lib/ai-gateway.server";

const GRAPH_VERSION = "v21.0";

export async function sendWhatsAppText(toE164: string, body: string) {
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) {
    console.warn("[whatsapp] WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID missing");
    return { ok: false, error: "not_configured" as const };
  }
  const to = toE164.replace(/[^\d]/g, "");
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneId}/messages`;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: body.slice(0, 4000), preview_url: false },
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      console.error(`[whatsapp] send failed [${res.status}]:`, redactSecrets(text));
      return { ok: false as const, error: `graph_${res.status}` };
    }
    return { ok: true as const, response: text };
  } catch (e) {
    console.error("[whatsapp] send exception:", redactSecrets(e instanceof Error ? e.message : String(e)));
    return { ok: false as const, error: "network" };
  }
}
