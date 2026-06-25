// Server-only helper. Multi-provider with OpenAI primary + Lovable AI fallback.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export const CHAT_MODEL = "google/gemini-2.5-flash";
export const OPENAI_CHAT_MODEL = "gpt-4o-mini";

function lovableProvider() {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

function openaiProvider() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return createOpenAI({ apiKey: key });
}

// Back-compat: returns Lovable provider (used by code that calls provider(MODEL))
export function getAiProvider() {
  return lovableProvider();
}

/**
 * Returns an ordered list of [label, model] candidates.
 * Prefers OpenAI when OPENAI_API_KEY is set, falls back to Lovable Gemini.
 */
export function getChatModels(): Array<{ label: string; model: LanguageModel }> {
  const out: Array<{ label: string; model: LanguageModel }> = [];
  const oa = openaiProvider();
  if (oa) out.push({ label: `openai:${OPENAI_CHAT_MODEL}`, model: oa(OPENAI_CHAT_MODEL) });
  out.push({ label: `lovable:${CHAT_MODEL}`, model: lovableProvider()(CHAT_MODEL) });
  return out;
}

/**
 * Removes any occurrence of server-side secrets from a string. Used before
 * logging or returning error messages to the client.
 */
export function redactSecrets(input: string): string {
  let out = input;
  const secrets = [
    process.env.OPENAI_API_KEY,
    process.env.LOVABLE_API_KEY,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  ].filter((v): v is string => typeof v === "string" && v.length >= 8);
  for (const s of secrets) {
    // Escape regex specials
    const safe = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(safe, "g"), "[REDACTED]");
  }
  // Generic OpenAI / Bearer patterns
  out = out.replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED]");
  out = out.replace(/Bearer\s+[A-Za-z0-9._-]{16,}/gi, "Bearer [REDACTED]");
  return out;
}

/**
 * Try an async AI call across providers in order. Returns the first success.
 * Throws an aggregated, secret-redacted error if all fail.
 */
export async function withProviderFallback<T>(
  fn: (model: LanguageModel, label: string) => Promise<T>,
): Promise<T> {
  const candidates = getChatModels();
  const errors: string[] = [];
  for (const { label, model } of candidates) {
    try {
      return await fn(model, label);
    } catch (e) {
      const msg = redactSecrets(e instanceof Error ? e.message : String(e));
      console.error(`[ai] provider ${label} failed:`, msg);
      errors.push(`${label}: ${msg}`);
    }
  }
  throw new Error(redactSecrets(`Todos os provedores de IA falharam. ${errors.join(" | ")}`));
}

