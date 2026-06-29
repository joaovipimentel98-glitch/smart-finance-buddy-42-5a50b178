// Server-only helper. Multi-provider with Lovable AI primary + OpenAI fallback.
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export const CHAT_MODEL = "google/gemini-3-flash-preview";
export const OPENAI_CHAT_MODEL = "gpt-4o-mini";

export const LOVABLE_AIG_RUN_ID_HEADER = "X-Lovable-AIG-Run-ID";
export const LOVABLE_AIG_LOG_ID_HEADER = "X-Lovable-AIG-Log-ID";

export type LovableGateway = {
  provider: ReturnType<typeof createOpenAICompatible>;
  getRunId: () => string | undefined;
  getLogId: () => string | undefined;
  waitForIds: () => Promise<{ runId?: string; logId?: string }>;
};

/**
 * Per-request Lovable AI Gateway provider that captures correlation headers
 * (`X-Lovable-AIG-Run-ID`, `X-Lovable-AIG-Log-ID`) from the upstream response.
 */
export function createLovableGateway(initialRunId?: string): LovableGateway {
  const key = process.env.LOVABLE_API_KEY;
  if (!key) throw new Error("Missing LOVABLE_API_KEY");

  let runId: string | undefined = initialRunId?.trim() || undefined;
  let logId: string | undefined;
  let resolved = false;
  let resolveIds: (v: { runId?: string; logId?: string }) => void = () => {};
  const ready = new Promise<{ runId?: string; logId?: string }>((r) => { resolveIds = r; });
  const publish = (r?: string, l?: string) => {
    if (!runId && r) runId = r;
    if (!logId && l) logId = l;
    if (!resolved) { resolved = true; resolveIds({ runId, logId }); }
  };

  const provider = createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
    fetch: async (input, init) => {
      const headers = new Headers(init?.headers);
      if (runId && !headers.has(LOVABLE_AIG_RUN_ID_HEADER)) headers.set(LOVABLE_AIG_RUN_ID_HEADER, runId);
      try {
        const res = await fetch(input, { ...init, headers });
        publish(
          res.headers.get(LOVABLE_AIG_RUN_ID_HEADER) ?? undefined,
          res.headers.get(LOVABLE_AIG_LOG_ID_HEADER) ?? undefined,
        );
        return res;
      } catch (e) {
        publish();
        throw e;
      }
    },
  });

  return {
    provider,
    getRunId: () => runId,
    getLogId: () => logId,
    waitForIds: () => (resolved ? Promise.resolve({ runId, logId }) : ready),
  };
}

function openaiProvider() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return createOpenAI({ apiKey: key });
}

// Back-compat for callers that don't need correlation IDs.
export function getAiProvider() {
  return createLovableGateway().provider;
}

export type ChatCandidate = {
  label: string;
  model: LanguageModel;
  gateway?: LovableGateway;
};

/**
 * Returns ordered providers. Lovable first (managed), OpenAI as fallback.
 * If `initialRunId` is provided, the Lovable provider seeds it on the first request.
 */
export function getChatModels(initialRunId?: string): ChatCandidate[] {
  const out: ChatCandidate[] = [];
  const gw = createLovableGateway(initialRunId);
  out.push({ label: `lovable:${CHAT_MODEL}`, model: gw.provider(CHAT_MODEL), gateway: gw });
  const oa = openaiProvider();
  if (oa) out.push({ label: `openai:${OPENAI_CHAT_MODEL}`, model: oa(OPENAI_CHAT_MODEL) });
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
    const safe = s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    out = out.replace(new RegExp(safe, "g"), "[REDACTED]");
  }
  out = out.replace(/sk-[A-Za-z0-9_-]{16,}/g, "[REDACTED]");
  out = out.replace(/Bearer\s+[A-Za-z0-9._-]{16,}/gi, "Bearer [REDACTED]");
  return out;
}

/**
 * Try an async AI call across providers in order. Returns the first success.
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

/**
 * Wraps a streaming Response so that correlation headers captured from the
 * upstream gateway are attached before the body starts flowing to the client.
 */
export async function withCorrelationHeaders(
  response: Response,
  gateway: LovableGateway | undefined,
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(extraHeaders)) headers.set(k, v);

  if (!response.body) {
    if (gateway?.getRunId()) headers.set(LOVABLE_AIG_RUN_ID_HEADER, gateway.getRunId()!);
    if (gateway?.getLogId()) headers.set(LOVABLE_AIG_LOG_ID_HEADER, gateway.getLogId()!);
    appendExpose(headers);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }

  const reader = response.body.getReader();
  const firstChunk = reader.read();
  if (gateway) {
    const ids = await gateway.waitForIds();
    if (ids.runId) headers.set(LOVABLE_AIG_RUN_ID_HEADER, ids.runId);
    if (ids.logId) headers.set(LOVABLE_AIG_LOG_ID_HEADER, ids.logId);
  }
  appendExpose(headers);

  const body = new ReadableStream({
    async start(controller) {
      try {
        const first = await firstChunk;
        if (first.done) { controller.close(); return; }
        controller.enqueue(first.value);
        while (true) {
          const c = await reader.read();
          if (c.done) break;
          controller.enqueue(c.value);
        }
        controller.close();
      } catch (e) { controller.error(e); }
    },
    cancel(reason) { return reader.cancel(reason); },
  });

  return new Response(body, { status: response.status, statusText: response.statusText, headers });
}

function appendExpose(headers: Headers) {
  const expose = new Set(
    (headers.get("Access-Control-Expose-Headers") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  );
  expose.add(LOVABLE_AIG_RUN_ID_HEADER);
  expose.add(LOVABLE_AIG_LOG_ID_HEADER);
  expose.add("X-Request-Id");
  headers.set("Access-Control-Expose-Headers", Array.from(expose).join(", "));
}
