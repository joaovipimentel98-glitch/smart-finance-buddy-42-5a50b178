import { createFileRoute } from "@tanstack/react-router";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { MessageSquare, Send, Loader2, Sparkles } from "lucide-react";
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

function ChatPage() {
  const [token, setToken] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? null));
  }, []);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "/api/chat",
        headers: () => ({ Authorization: token ? `Bearer ${token}` : "" }),
      }),
    [token],
  );

  const { messages, sendMessage, status } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  const send = (text: string) => {
    if (!text.trim() || busy || !token) return;
    sendMessage({ text });
    setInput("");
  };

  return (
    <div className="flex flex-col h-screen max-h-screen">
      <header className="px-6 md:px-10 py-6 border-b border-border">
        <h1 className="text-2xl font-semibold flex items-center gap-2"><MessageSquare className="size-6 text-primary" /> Chat Financeiro</h1>
        <p className="text-sm text-muted-foreground mt-1">Pergunte qualquer coisa sobre suas finanças — a IA consulta seus dados em tempo real.</p>
      </header>

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
