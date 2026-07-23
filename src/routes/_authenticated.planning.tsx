import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Target, Save, Trash2, AlertTriangle } from "lucide-react";
import { listCategories } from "@/lib/categories.functions";
import {
  getBudgetProgress,
  upsertBudget,
  deleteBudget,
} from "@/lib/budgets.functions";

export const Route = createFileRoute("/_authenticated/planning")({
  component: PlanningPage,
  head: () => ({ meta: [{ title: "Planejamento — Finance AI" }] }),
});

const fmtBRL = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function PlanningPage() {
  const qc = useQueryClient();
  const fetchCats = useServerFn(listCategories);
  const fetchProgress = useServerFn(getBudgetProgress);
  const saveBudget = useServerFn(upsertBudget);
  const removeBudget = useServerFn(deleteBudget);

  const now = new Date();
  const [month, setMonth] = useState(
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
  );

  const { data: cats } = useQuery({
    queryKey: ["categories"],
    queryFn: () => fetchCats(),
  });
  const { data: progress, isLoading } = useQuery({
    queryKey: ["budget-progress", month],
    queryFn: () => fetchProgress({ data: { month } }),
  });

  const rowsByCat = useMemo(() => {
    const map = new Map<string, { planned: number; spent: number; over: boolean }>();
    for (const r of progress?.rows ?? [])
      map.set(r.category, { planned: r.planned, spent: r.spent, over: r.over });
    return map;
  }, [progress]);

  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["budget-progress"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const handleSave = async (category: string) => {
    const raw = drafts[category];
    if (raw === undefined) return;
    const parsed = Number(raw.replace(",", "."));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error("Valor inválido");
      return;
    }
    try {
      await saveBudget({ data: { category, monthly_amount: parsed } });
      toast.success(`Planejamento de "${category}" salvo`);
      setDrafts((d) => {
        const { [category]: _, ...rest } = d;
        return rest;
      });
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    }
  };

  const handleDelete = async (id: string, category: string) => {
    if (!confirm(`Remover planejamento de "${category}"?`)) return;
    try {
      await removeBudget({ data: { id } });
      toast.success("Planejamento removido");
      invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    }
  };

  const sortedCats = useMemo(
    () => [...(cats ?? [])].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")),
    [cats],
  );

  const totalPlanned = progress?.totals.planned ?? 0;
  const totalSpent = progress?.totals.spent ?? 0;
  const overCount = progress?.rows.filter((r) => r.over).length ?? 0;

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold flex items-center gap-2">
            <Target className="size-7 text-primary" /> Planejamento
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Defina quanto pretende gastar por categoria a cada mês e acompanhe o realizado.
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="bg-transparent border border-border rounded-lg px-3 py-2 text-sm"
        />
      </header>

      <section className="grid grid-cols-2 md:grid-cols-3 gap-4 mb-6">
        <SummaryCard label="Planejado" value={fmtBRL(totalPlanned)} tone="primary" />
        <SummaryCard label="Realizado" value={fmtBRL(totalSpent)} tone={totalSpent > totalPlanned ? "destructive" : "success"} />
        <SummaryCard
          label="Categorias estouradas"
          value={String(overCount)}
          tone={overCount > 0 ? "destructive" : "success"}
        />
      </section>

      {isLoading ? (
        <div className="text-muted-foreground">Carregando...</div>
      ) : (
        <div className="surface-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Categoria</th>
                <th className="px-4 py-3 text-right w-40">Planejado</th>
                <th className="px-4 py-3 text-right w-32">Gasto</th>
                <th className="px-4 py-3 text-left w-64">Progresso</th>
                <th className="px-4 py-3 text-right w-32">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/50">
              {sortedCats.map((c) => {
                const info = rowsByCat.get(c.name);
                const planned = info?.planned ?? 0;
                const spent = info?.spent ?? 0;
                const pct = planned > 0 ? Math.min(100, (spent / planned) * 100) : 0;
                const over = info?.over ?? false;
                const draft = drafts[c.name];
                const displayVal = draft !== undefined ? draft : planned > 0 ? String(planned) : "";
                const budgetRow = progress?.rows.find((r) => r.category === c.name);
                return (
                  <tr key={c.id} className="hover:bg-white/[0.02]">
                    <td className="px-4 py-3 font-medium flex items-center gap-2">
                      <span
                        className="size-3 rounded-full"
                        style={{ background: c.color || "#64748b" }}
                      />
                      {c.name}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center gap-2 justify-end">
                        <span className="text-muted-foreground">R$</span>
                        <input
                          type="number"
                          inputMode="decimal"
                          min="0"
                          step="0.01"
                          value={displayVal}
                          onChange={(e) =>
                            setDrafts((d) => ({ ...d, [c.name]: e.target.value }))
                          }
                          onKeyDown={(e) => e.key === "Enter" && handleSave(c.name)}
                          placeholder="0,00"
                          className="w-28 bg-transparent border border-border rounded-md px-2 py-1 text-right text-sm"
                        />
                      </div>
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${over ? "text-destructive" : ""}`}>
                      {fmtBRL(spent)}
                    </td>
                    <td className="px-4 py-3">
                      {planned > 0 ? (
                        <div className="flex items-center gap-2">
                          <div className="h-2 flex-1 bg-white/5 rounded-full overflow-hidden">
                            <div
                              className={`h-full ${
                                over ? "bg-destructive" : pct > 80 ? "bg-warning" : "bg-primary"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className={`text-xs w-12 text-right ${over ? "text-destructive" : "text-muted-foreground"}`}>
                            {Math.round((spent / planned) * 100)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-xs text-muted-foreground">sem meta</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-1">
                        {draft !== undefined && (
                          <button
                            onClick={() => handleSave(c.name)}
                            className="p-1.5 rounded-md bg-primary/15 text-primary hover:bg-primary/25"
                            title="Salvar"
                          >
                            <Save className="size-4" />
                          </button>
                        )}
                        {budgetRow && (
                          <button
                            onClick={() => handleDelete(budgetRow.id, c.name)}
                            className="p-1.5 text-muted-foreground hover:text-destructive"
                            title="Remover meta"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {sortedCats.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    Nenhuma categoria. Crie categorias em /categories primeiro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {overCount > 0 && (
        <div className="mt-4 surface-card p-4 border border-destructive/30 bg-destructive/5 flex items-start gap-3">
          <AlertTriangle className="size-5 text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <div className="font-medium text-destructive">
              {overCount} {overCount === 1 ? "categoria estourada" : "categorias estouradas"} este mês
            </div>
            <div className="text-muted-foreground mt-1">
              {progress?.rows
                .filter((r) => r.over)
                .map((r) => `${r.category} (${fmtBRL(r.spent - r.planned)} acima)`)
                .join(" • ")}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "primary" | "success" | "destructive";
}) {
  const toneClass = {
    primary: "text-primary",
    success: "text-success",
    destructive: "text-destructive",
  }[tone];
  return (
    <div className="surface-card p-5">
      <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className={`text-2xl font-semibold mt-2 ${toneClass}`}>{value}</div>
    </div>
  );
}
