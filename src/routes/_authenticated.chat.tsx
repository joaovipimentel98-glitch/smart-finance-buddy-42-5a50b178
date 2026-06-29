import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Send, Loader2, Sparkles, Activity, Copy, Check } from "lucide-react";
import ReactMarkdown from "react-markdown";

export const Route = createFileRoute("/_authenticated/chat")({
  component: ChatPage,
  head: () => ({ meta: [{ title: "Chat — Finance AI" }] }),
});

const SUGGESTIONS = [
  "Quanto gastei com iFood este mês?",
  "Quais foram meus maiores gastos nos últimos 30 dias?",
  "Onde estou desperdiçando dinheiro?",
  "Quanto gasto em média por semana?",
];

type Diagnostics = {
  userId?: string;
  tokenPresent: boolean;
  tokenExpiresInSec?: number;
  lastRequestId?: string;
  lastRequestBytes?: number;
  lastMessageCount?: number;
  lastResponseStatus?: number;
  lastRunId?: string;
  lastLogId?: string;
  lastProvider?: string;
  lastErrorRedacted?: string;
  lastAt?: string;
};

function ChatPage() {
  const [token, setToken] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | undefined>();
  const [expiresAt, setExpiresAt] = useState<number | undefined>();
  const [input, setInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showDiag, setShowDiag] = useState(false);
  const [copied, setCopied] = useState(false);
  const [diag, setDiag] = useState<Diagnostics>({ tokenPresent: false });
  const diagRef = useRef<Diagnostics>(diag);
  diagRef.current = diag;
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setToken(data.session?.access_token ?? null);
      setUserId(data.session?.user?.id);
      setExpiresAt(data.session?.expires_at ?? undefined);
    });
  }, []);

  useEffect(() => {
    setDiag((d) => ({
      ...d,
      userId,
      tokenPresent: !!token,
      tokenExpiresInSec: expiresAt ? Math.max(0, expiresAt - Math.floor(Date.now() / 1000)) : undefined,
    }));
  }, [token, userId, expiresAt]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        fetch: async (input, init) => {
          const requestId =
            (typeof crypto !== "undefined" && crypto.randomUUID?.()) ||
            Math.random().toString(36).slice(2);
          const headers = new Headers(init?.headers);
          headers.set("X-Request-Id", requestId);
          if (token) headers.set("Authorization", `Bearer ${token}`);

          let bytes: number | undefined;
          let messageCount: number | undefined;
          const body = init?.body;
          if (typeof body === "string") {
            bytes = new TextEncoder().encode(body).length;
            try {
              const parsed = JSON.parse(body) as { messages?: unknown[] };
              if (Array.isArray(parsed.messages)) messageCount = parsed.messages.length;
            } catch { /* ignore */ }
          }

          setDiag((d) => ({
            ...d,
            lastRequestId: requestId,
            lastRequestBytes: bytes,
            lastMessageCount: messageCount,
            lastResponseStatus: undefined,
            lastRunId: undefined,
            lastLogId: undefined,
            lastProvider: undefined,
            lastErrorRedacted: undefined,
            lastAt: new Date().toISOString(),
          }));

          const res = await fetch(input as RequestInfo, { ...init, headers });
          setDiag((d) => ({
            ...d,
            lastResponseStatus: res.status,
            lastRunId: res.headers.get("X-Lovable-AIG-Run-ID") ?? undefined,
            lastLogId: res.headers.get("X-Lovable-AIG-Log-ID") ?? undefined,
            lastProvider: res.headers.get("X-Chat-Provider") ?? undefined,
            lastRequestId: res.headers.get("X-Request-Id") ?? d.lastRequestId,
          }));
          return res;
        },
      }),
    [token],
  );

  const { messages, sendMessage, status } = useChat({
    transport,
    onError: (error) => {
      const msg = error.message || "Não foi possível conectar ao chat.";
      setErrorMessage(msg);
      setDiag((d) => ({ ...d, lastErrorRedacted: msg }));
    },
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = (text: string) => {
    if (!text.trim() || busy || !token) return;
    setErrorMessage(null);
    sendMessage({ text });
    setInput("");
  };

  const copyDiag = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagRef.current, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  };

  return (
    <div className="flex flex-col h-screen max-h-screen">
      <header className="px-6 md:px-10 py-6 border-b border-border flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2"><MessageSquare className="size-6 text-primary" /> Chat Financeiro</h1>
          <p className="text-sm text-muted-foreground mt-1">Pergunte qualquer coisa sobre suas finanças — a IA consulta seus dados em tempo real.</p>
        </div>
        <button
          type="button"
          onClick={() => setShowDiag((s) => !s)}
          className="shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:bg-secondary/50"
          aria-expanded={showDiag}
        >
          <Activity className="size-3.5" /> Diagnóstico
        </button>
      </header>

      {showDiag && (
        <div className="px-6 md:px-10 py-4 border-b border-border bg-secondary/30">
          <div className="max-w-3xl mx-auto text-xs font-mono space-y-1">
            <DiagRow label="Status">
              {diag.tokenPresent ? (
                <span className="text-emerald-500">
                  ✓ autenticado
                  {typeof diag.tokenExpiresInSec === "number" &&
                    ` (token válido por ${Math.floor(diag.tokenExpiresInSec / 60)}min)`}
                </span>
              ) : (
                <span className="text-destructive">✗ sem sessão</span>
              )}
            </DiagRow>
            <DiagRow label="User">{diag.userId ?? "—"}</DiagRow>
            <DiagRow label="Última req">
              {diag.lastRequestId
                ? `${diag.lastMessageCount ?? "?"} msg · ${formatBytes(diag.lastRequestBytes)} · id=${diag.lastRequestId.slice(0, 8)}`
                : "—"}
            </DiagRow>
            <DiagRow label="Resposta">
              {diag.lastResponseStatus
                ? `HTTP ${diag.lastResponseStatus}${diag.lastProvider ? ` · ${diag.lastProvider}` : ""}${diag.lastRunId ? ` · run=${diag.lastRunId.slice(0, 8)}` : ""}${diag.lastLogId ? ` · log=${diag.lastLogId.slice(0, 8)}` : ""}`
                : "—"}
            </DiagRow>
            <DiagRow label="Erro">
              {diag.lastErrorRedacted ? (
                <span className="text-destructive break-all">{diag.lastErrorRedacted}</span>
              ) : "—"}
            </DiagRow>
            <div className="pt-2">
              <button
                type="button"
                onClick={copyDiag}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border border-border hover:bg-background"
              >
                {copied ? <><Check className="size-3" /> Copiado</> : <><Copy className="size-3" /> Copiar diagnóstico</>}
              </button>
            </div>
          </div>
        </div>
      )}

      <div ref={scrollerRef} className="flex-1 overflow-y-auto px-6 md:px-10 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <Sparkles className="size-10 mx-auto text-primary mb-4" />
              <h3 className="text-lg font-medium mb-6">Sobre o que você quer saber?</h3>
              <div className="grid sm:grid-cols-2 gap-2 max-w-xl mx-auto">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => send(s)}
                    className="surface-card surface-card-hover p-3 text-sm text-left text-muted-foreground hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m) => {
            const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
            return (
              <div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm ${
                    m.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "surface-card prose prose-sm prose-invert max-w-none"
                  }`}
                >
                  {m.role === "user" ? text : <ReactMarkdown>{text || "..."}</ReactMarkdown>}
                </div>
              </div>
            );
          })}
          {busy && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Analisando seus dados...
            </div>
          )}
          {errorMessage && (
            <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {errorMessage}
              {diag.lastRequestId && (
                <div className="text-xs mt-1 opacity-80 font-mono">req={diag.lastRequestId.slice(0, 8)}</div>
              )}
            </div>
          )}
        </div>
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); send(input); }}
        className="px-6 md:px-10 py-4 border-t border-border"
      >
        <div className="max-w-3xl mx-auto flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte sobre suas finanças..."
            disabled={busy || !token}
            className="flex-1 bg-secondary/50 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-primary"
          />
          <button
            type="submit"
            disabled={busy || !input.trim() || !token}
            className="px-4 py-3 rounded-xl bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Send className="size-4" />
          </button>
        </div>
      </form>
    </div>
  );
}

function DiagRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="text-muted-foreground w-24 shrink-0">{label}:</span>
      <span className="flex-1 break-all">{children}</span>
    </div>
  );
}

function formatBytes(n?: number) {
  if (!n && n !== 0) return "?";
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}
