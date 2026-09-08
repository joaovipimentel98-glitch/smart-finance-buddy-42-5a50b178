import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  Bot,
  Check,
  ChevronDown,
  Copy,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  User,
} from "lucide-react";
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
  const inputRef = useRef<HTMLInputElement>(null);

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
      tokenExpiresInSec: expiresAt
        ? Math.max(0, expiresAt - Math.floor(Date.now() / 1000))
        : undefined,
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
          let { data: sessionData } = await supabase.auth.getSession();
          let freshToken = sessionData.session?.access_token;
          const expiresAtSec = sessionData.session?.expires_at ?? 0;
          const nowSec = Math.floor(Date.now() / 1000);
          if (!freshToken || expiresAtSec - nowSec < 30) {
            const { data: refreshed } = await supabase.auth.refreshSession();
            if (refreshed.session?.access_token) {
              freshToken = refreshed.session.access_token;
              sessionData = { session: refreshed.session } as typeof sessionData;
            }
          }
          if (!freshToken) {
            setDiag((d) => ({
              ...d,
              tokenPresent: false,
              lastRequestId: requestId,
              lastErrorRedacted: "Sessão expirada. Redirecionando para login…",
              lastAt: new Date().toISOString(),
            }));
            const next = encodeURIComponent(window.location.pathname);
            window.location.replace(`/auth?next=${next}`);
            return new Response(JSON.stringify({ error: "Sessão expirada", requestId }), {
              status: 401,
              headers: { "Content-Type": "application/json", "X-Request-Id": requestId },
            });
          }
          headers.set("Authorization", `Bearer ${freshToken}`);

          let bytes: number | undefined;
          let messageCount: number | undefined;
          const body = init?.body;
          if (typeof body === "string") {
            bytes = new TextEncoder().encode(body).length;
            try {
              const parsed = JSON.parse(body) as { messages?: unknown[] };
              if (Array.isArray(parsed.messages)) messageCount = parsed.messages.length;
            } catch {
              // Ignore malformed diagnostic payloads. The request itself is still sent.
            }
          }

          setDiag((d) => ({
            ...d,
            tokenPresent: true,
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
          if (res.status === 401) {
            const next = encodeURIComponent(window.location.pathname);
            setTimeout(() => window.location.replace(`/auth?next=${next}`), 800);
          }
          return res;
        },
      }),
    [],
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
    scrollerRef.current?.scrollTo({
      top: scrollerRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, busy]);

  const send = (text: string) => {
    if (!text.trim() || busy || !token) return;
    setErrorMessage(null);
    sendMessage({ text });
    setInput("");
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const copyDiag = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(diagRef.current, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard access can be unavailable in some browser contexts.
    }
  };

  return (
    <div className="flex min-h-[calc(100dvh-0px)] flex-col bg-background">
      <header className="sticky top-0 z-20 border-b border-border/70 bg-background/90 px-4 py-4 backdrop-blur-xl sm:px-6 md:px-10">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <Sparkles className="size-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-base font-semibold text-foreground sm:text-lg">Chat Financeiro</h1>
                <span className="hidden rounded-full border border-success/20 bg-success/10 px-2 py-0.5 text-[10px] font-medium text-success sm:inline-flex">
                  IA online
                </span>
              </div>
              <p className="truncate text-xs text-muted-foreground sm:text-sm">
                Seu copiloto para entender suas finanças.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowDiag((s) => !s)}
            className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-medium transition ${
              showDiag
                ? "border-primary/30 bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            }`}
            aria-expanded={showDiag}
          >
            <Activity className="size-3.5" />
            <span className="hidden sm:inline">Diagnóstico</span>
            <ChevronDown className={`size-3.5 transition ${showDiag ? "rotate-180" : ""}`} />
          </button>
        </div>
      </header>

      {showDiag && (
        <div className="border-b border-border/70 bg-secondary/20 px-4 py-4 sm:px-6 md:px-10">
          <div className="mx-auto max-w-5xl rounded-2xl border border-border/70 bg-card p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold text-foreground">Diagnóstico da conexão</p>
              <button
                type="button"
                onClick={copyDiag}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                {copied ? <Check className="size-3" /> : <Copy className="size-3" />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <div className="grid gap-2 text-[11px] font-mono sm:grid-cols-2 lg:grid-cols-3">
              <DiagRow label="Status">
                {diag.tokenPresent ? (
                  <span className="text-success">
                    ✓ autenticado
                    {typeof diag.tokenExpiresInSec === "number" &&
                      ` · ${Math.floor(diag.tokenExpiresInSec / 60)}min`}
                  </span>
                ) : (
                  <span className="text-destructive">✗ sem sessão</span>
                )}
              </DiagRow>
              <DiagRow label="User">{diag.userId ?? "—"}</DiagRow>
              <DiagRow label="Última req">
                {diag.lastRequestId
                  ? `${diag.lastMessageCount ?? "?"} msg · ${formatBytes(diag.lastRequestBytes)} · ${diag.lastRequestId.slice(0, 8)}`
                  : "—"}
              </DiagRow>
              <DiagRow label="Resposta">
                {diag.lastResponseStatus
                  ? `HTTP ${diag.lastResponseStatus}${diag.lastProvider ? ` · ${diag.lastProvider}` : ""}${diag.lastRunId ? ` · run=${diag.lastRunId.slice(0, 8)}` : ""}${diag.lastLogId ? ` · log=${diag.lastLogId.slice(0, 8)}` : ""}`
                  : "—"}
              </DiagRow>
              <DiagRow label="Erro">
                {diag.lastErrorRedacted ? (
                  <span className="break-all text-destructive">{diag.lastErrorRedacted}</span>
                ) : (
                  "—"
                )}
              </DiagRow>
            </div>
          </div>
        </div>
      )}

      <main ref={scrollerRef} className="flex-1 overflow-y-auto px-4 sm:px-6 md:px-10">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col py-6 sm:py-8">
          {messages.length === 0 ? (
            <EmptyChat onSuggestion={send} />
          ) : (
            <div className="space-y-6 pb-8">
              {messages.map((m) => {
                const text = m.parts.map((p) => (p.type === "text" ? p.text : "")).join("");
                const isUser = m.role === "user";
                return (
                  <div key={m.id} className={`flex gap-3 ${isUser ? "justify-end" : "justify-start"}`}>
                    {!isUser && (
                      <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                        <Bot className="size-4" />
                      </div>
                    )}
                    <div className={`max-w-[88%] sm:max-w-[78%] ${isUser ? "items-end" : "items-start"}`}>
                      <div
                        className={`rounded-2xl px-4 py-3.5 text-sm leading-6 ${
                          isUser
                            ? "rounded-br-md bg-primary text-primary-foreground shadow-sm"
                            : "rounded-bl-md border border-border/70 bg-card text-foreground shadow-sm"
                        }`}
                      >
                        {isUser ? (
                          <p className="whitespace-pre-wrap">{text}</p>
                        ) : (
                          <div className="prose prose-sm max-w-none prose-p:my-1.5 prose-headings:mb-2 prose-headings:mt-4 prose-li:my-0.5 dark:prose-invert">
                            <ReactMarkdown>{text || "..."}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                    {isUser && (
                      <div className="mt-1 grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
                        <User className="size-4" />
                      </div>
                    )}
                  </div>
                );
              })}

              {busy && (
                <div className="flex items-center gap-3 pl-11 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5">
                    <span className="size-1.5 animate-pulse rounded-full bg-primary" />
                    <span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:120ms]" />
                    <span className="size-1.5 animate-pulse rounded-full bg-primary [animation-delay:240ms]" />
                    <span className="ml-1">Analisando seus dados</span>
                  </span>
                </div>
              )}

              {errorMessage && <ErrorBox message={errorMessage} requestId={diag.lastRequestId} />}
            </div>
          )}
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-border/70 bg-background/90 px-4 py-3 backdrop-blur-xl sm:px-6 md:px-10">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(input);
          }}
          className="mx-auto max-w-3xl"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-border/80 bg-card p-1.5 shadow-lg shadow-black/5 transition focus-within:border-primary/40 focus-within:ring-2 focus-within:ring-primary/10">
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              placeholder="Pergunte sobre suas finanças..."
              disabled={busy || !token}
              className="min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-60"
              aria-label="Pergunte sobre suas finanças"
            />
            <button
              type="submit"
              disabled={busy || !input.trim() || !token}
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label="Enviar mensagem"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </button>
          </div>
          <p className="mt-2 text-center text-[10px] text-muted-foreground sm:text-[11px]">
            A IA consulta os dados financeiros disponíveis na sua conta para responder.
          </p>
        </form>
      </footer>
    </div>
  );
}

function EmptyChat({ onSuggestion }: { onSuggestion: (text: string) => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center py-8 sm:py-14">
      <div className="mb-5 grid size-16 place-items-center rounded-2xl bg-primary/10 text-primary shadow-sm">
        <Sparkles className="size-7" />
      </div>
      <h2 className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">Como posso ajudar?</h2>
      <p className="mt-2 max-w-md text-center text-sm leading-6 text-muted-foreground">
        Pergunte sobre gastos, categorias, tendências ou qualquer outro ponto da sua vida financeira.
      </p>

      <div className="mt-8 grid w-full max-w-2xl gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            onClick={() => onSuggestion(suggestion)}
            className="group rounded-xl border border-border/70 bg-card px-4 py-3 text-left text-sm text-muted-foreground shadow-sm transition hover:border-primary/30 hover:bg-primary/[0.03] hover:text-foreground"
          >
            <span className="flex items-center justify-between gap-3">
              <span>{suggestion}</span>
              <MessageSquare className="size-3.5 shrink-0 opacity-0 transition group-hover:opacity-100" />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function ErrorBox({ message, requestId }: { message: string; requestId?: string }) {
  return (
    <div className="ml-11 rounded-2xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
      <p>{message}</p>
      {requestId && <p className="mt-1 font-mono text-[10px] opacity-70">req={requestId.slice(0, 8)}</p>}
    </div>
  );
}

function DiagRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-lg bg-secondary/50 px-2.5 py-2">
      <span className="mr-2 text-muted-foreground">{label}:</span>
      <span className="break-all text-foreground">{children}</span>
    </div>
  );
}

function formatBytes(n?: number) {
  if (!n && n !== 0) return "?";
  if (n < 1024) return `${n} B`;
  return `${(n / 1024).toFixed(1)} KB`;
}
