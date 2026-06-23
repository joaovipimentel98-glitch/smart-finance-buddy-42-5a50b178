import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { listInsights, generateInsights } from "@/lib/insights.functions";
import { Sparkles, AlertTriangle, Info, CheckCircle2, AlertOctagon, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/insights")({
  component: InsightsPage,
  head: () => ({ meta: [{ title: "Consultor IA — Finance AI" }] }),
});

const ICONS = {
  info: Info,
  warning: AlertTriangle,
  critical: AlertOctagon,
  success: CheckCircle2,
} as const;
const COLORS = {
  info: "text-primary bg-primary/10 border-primary/20",
  warning: "text-warning bg-warning/10 border-warning/20",
  critical: "text-destructive bg-destructive/10 border-destructive/20",
  success: "text-success bg-success/10 border-success/20",
} as const;

function InsightsPage() {
  const qc = useQueryClient();
  const fetch = useServerFn(listInsights);
  const gen = useServerFn(generateInsights);
  const { data: insights } = useQuery({ queryKey: ["insights"], queryFn: () => fetch() });
  const [generating, setGenerating] = useState(false);

  const run = async () => {
    setGenerating(true);
    try {
      const r = await gen();
      if ("generated" in r && r.generated) toast.success(`${r.generated} insights gerados.`);
      else if ("message" in r) toast.info(r.message);
      qc.invalidateQueries({ queryKey: ["insights"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-6 flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2"><Sparkles className="size-7 text-primary" /> Consultor Financeiro IA</h1>
          <p className="text-sm text-muted-foreground mt-1">Análises geradas pela IA com base nas suas transações dos últimos 90 dias.</p>
        </div>
        <button
          onClick={run}
          disabled={generating}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
        >
          {generating ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          {generating ? "Analisando..." : "Gerar novos insights"}
        </button>
      </header>

      <div className="grid md:grid-cols-2 gap-4">
        {(insights ?? []).map((i) => {
          const Icon = ICONS[i.severity];
          return (
            <div key={i.id} className={`surface-card p-5 border ${COLORS[i.severity]}`}>
              <div className="flex items-start gap-3">
                <div className={`size-9 rounded-xl grid place-items-center ${COLORS[i.severity]}`}>
                  <Icon className="size-4" />
                </div>
                <div className="flex-1">
                  <h3 className="font-medium text-foreground">{i.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1 leading-relaxed">{i.description}</p>
                </div>
              </div>
            </div>
          );
        })}
        {(!insights || insights.length === 0) && (
          <div className="md:col-span-2 surface-card p-12 text-center">
            <Sparkles className="size-10 mx-auto text-primary mb-3" />
            <p className="text-muted-foreground">Clique em "Gerar novos insights" para a IA analisar suas finanças.</p>
          </div>
        )}
      </div>
    </div>
  );
}
