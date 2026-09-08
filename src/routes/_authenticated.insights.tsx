import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listInsights, generateInsights } from "@/lib/insights.functions";
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Info,
  Loader2,
  MessageSquare,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
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

const META = {
  info: {
    label: "Informação",
    icon: "text-primary bg-primary/10 border-primary/20",
    bar: "bg-primary",
    badge: "text-primary bg-primary/10 border-primary/20",
  },
  warning: {
    label: "Atenção",
    icon: "text-warning bg-warning/10 border-warning/20",
    bar: "bg-warning",
    badge: "text-warning bg-warning/10 border-warning/20",
  },
  critical: {
    label: "Prioridade",
    icon: "text-destructive bg-destructive/10 border-destructive/20",
    bar: "bg-destructive",
    badge: "text-destructive bg-destructive/10 border-destructive/20",
  },
  success: {
    label: "Ponto positivo",
    icon: "text-success bg-success/10 border-success/20",
    bar: "bg-success",
    badge: "text-success bg-success/10 border-success/20",
  },
} as const;

function InsightsPage() {
  const qc = useQueryClient();
  const fetch = useServerFn(listInsights);
  const gen = useServerFn(generateInsights);
  const { data: insights, isLoading } = useQuery({
    queryKey: ["insights"],
    queryFn: () => fetch(),
  });
  const [generating, setGenerating] = useState(false);

  const counts = useMemo(() => {
    const items = insights ?? [];
    return {
      total: items.length,
      critical: items.filter((i) => i.severity === "critical").length,
      warning: items.filter((i) => i.severity === "warning").length,
      success: items.filter((i) => i.severity === "success").length,
    };
  }, [insights]);

  const run = async () => {
    setGenerating(true);
    try {
      const r = await gen();
      if ("generated" in r && r.generated) toast.success(`${r.generated} insights gerados.`);
      else if ("message" in r) toast.info(r.message);
      qc.invalidateQueries({ queryKey: ["insights"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Não foi possível gerar os insights.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="min-h-full px-4 py-5 sm:px-6 md:px-10 md:py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="relative overflow-hidden rounded-3xl border border-border/70 bg-gradient-to-br from-primary/[0.14] via-card to-card p-6 shadow-sm md:p-8">
          <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-primary/10 blur-3xl" />
          <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <Sparkles className="size-3.5" /> Inteligência financeira
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl md:text-4xl">
                Seu consultor financeiro com IA.
              </h1>
              <p className="mt-3 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">
                A IA analisa suas transações dos últimos 90 dias para encontrar padrões,
                oportunidades e pontos que merecem sua atenção.
              </p>
            </div>
            <button
              onClick={run}
              disabled={generating}
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {generating ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {generating ? "Analisando..." : "Gerar nova análise"}
            </button>
          </div>
        </section>

        <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon={Sparkles} label="Insights" value={counts.total} />
          <MetricCard icon={Zap} label="Prioridades" value={counts.critical} emphasis={counts.critical > 0} />
          <MetricCard icon={AlertTriangle} label="Atenções" value={counts.warning} />
          <MetricCard icon={TrendingUp} label="Pontos positivos" value={counts.success} />
        </section>

        <section className="space-y-4">
          <div className="flex items-end justify-between gap-4">
            <div>
              <h2 className="text-lg font-semibold text-foreground">Análise da sua vida financeira</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Recomendações organizadas pela importância para você.
              </p>
            </div>
            {insights && insights.length > 0 && (
              <span className="hidden text-xs text-muted-foreground sm:block">
                {insights.length} {insights.length === 1 ? "análise" : "análises"}
              </span>
            )}
          </div>

          {isLoading || generating ? (
            <div className="grid gap-4 md:grid-cols-2">
              {[0, 1, 2, 3].map((item) => <InsightSkeleton key={item} />)}
            </div>
          ) : (insights ?? []).length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {(insights ?? []).map((insight) => {
                const Icon = ICONS[insight.severity];
                const meta = META[insight.severity];
                return (
                  <article
                    key={insight.id}
                    className="group relative overflow-hidden rounded-2xl border border-border/70 bg-card p-5 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-border hover:shadow-md"
                  >
                    <div className={`absolute inset-y-0 left-0 w-1 ${meta.bar}`} />
                    <div className="flex gap-4 pl-1">
                      <div className={`grid size-10 shrink-0 place-items-center rounded-xl border ${meta.icon}`}>
                        <Icon className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${meta.badge}`}>
                            {meta.label}
                          </span>
                        </div>
                        <h3 className="font-semibold leading-5 text-foreground">{insight.title}</h3>
                        <p className="mt-2 text-sm leading-6 text-muted-foreground">{insight.description}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-border bg-card/60 px-6 py-14 text-center">
              <div className="mx-auto mb-4 grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
                <Sparkles className="size-6" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Ainda não há uma análise</h3>
              <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted-foreground">
                Gere sua primeira análise para descobrir padrões de gastos, alertas e oportunidades de economia.
              </p>
              <button
                onClick={run}
                disabled={generating}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                <Sparkles className="size-4" /> Gerar minha análise
              </button>
            </div>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-card p-5">
            <div className="flex gap-3">
              <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                <Sparkles className="size-4" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">Análise baseada nos seus dados</h3>
                <p className="mt-1 text-sm leading-6 text-muted-foreground">
                  Os insights são gerados a partir do histórico financeiro disponível no seu perfil.
                </p>
              </div>
            </div>
          </div>
          <a
            href="/chat"
            className="group rounded-2xl border border-border/70 bg-card p-5 transition hover:border-primary/30 hover:bg-primary/[0.03]"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="flex gap-3">
                <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-secondary text-foreground">
                  <MessageSquare className="size-4" />
                </div>
                <div>
                  <h3 className="font-medium text-foreground">Quer investigar mais?</h3>
                  <p className="mt-1 text-sm text-muted-foreground">Converse com a IA sobre qualquer ponto das suas finanças.</p>
                </div>
              </div>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground transition group-hover:translate-x-1 group-hover:text-primary" />
            </div>
          </a>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  emphasis = false,
}: {
  icon: typeof Sparkles;
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border/70 bg-card p-4 shadow-sm sm:p-5">
      <div className="flex items-center justify-between gap-2">
        <div className="grid size-9 place-items-center rounded-xl bg-secondary text-muted-foreground">
          <Icon className="size-4" />
        </div>
        {emphasis && <span className="size-2 rounded-full bg-destructive" />}
      </div>
      <p className="mt-4 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

function InsightSkeleton() {
  return (
    <div className="animate-pulse rounded-2xl border border-border/70 bg-card p-5">
      <div className="flex gap-4">
        <div className="size-10 shrink-0 rounded-xl bg-secondary" />
        <div className="flex-1 space-y-3">
          <div className="h-4 w-24 rounded bg-secondary" />
          <div className="h-4 w-3/4 rounded bg-secondary" />
          <div className="h-3 w-full rounded bg-secondary" />
          <div className="h-3 w-5/6 rounded bg-secondary" />
        </div>
      </div>
    </div>
  );
}
