import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { TrendingUp, TrendingDown, Wallet, Loader2, ToggleLeft } from "lucide-react";
import { getInvestmentsSummary, listInvestments, toggleInvestment } from "@/lib/investments.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/investments")({
  component: InvestmentsPage,
  head: () => ({ meta: [{ title: "Investimentos — Finance AI" }] }),
});

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function InvestmentsPage() {
  const qc = useQueryClient();
  const fetchSummary = useServerFn(getInvestmentsSummary);
  const fetchList = useServerFn(listInvestments);
  const doToggle = useServerFn(toggleInvestment);

  const summary = useQuery({ queryKey: ["investments-summary"], queryFn: () => fetchSummary() });
  const list = useQuery({ queryKey: ["investments-list"], queryFn: () => fetchList() });

  const handleToggle = async (id: string) => {
    try {
      await doToggle({ data: { id, isInvestment: false } });
      qc.invalidateQueries({ queryKey: ["investments-summary"] });
      qc.invalidateQueries({ queryKey: ["investments-list"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Removido dos investimentos");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  if (summary.isLoading || list.isLoading) {
    return (
      <div className="p-10 flex items-center justify-center min-h-[60vh]">
        <Loader2 className="size-8 animate-spin text-primary" />
      </div>
    );
  }

  const s = summary.data;
  const rows = list.data ?? [];

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto space-y-8">
      <header>
        <h1 className="text-3xl font-semibold flex items-center gap-2">
          <TrendingUp className="size-7 text-primary" /> Investimentos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aportes e resgates marcados como investimento ficam fora do seu gasto mensal.
        </p>
      </header>

      {s && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="surface-card p-5">
            <div className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <Wallet className="size-3" /> Saldo líquido
            </div>
            <div className={`text-2xl font-semibold mt-2 ${s.saldoLiquido >= 0 ? "text-success" : "text-destructive"}`}>
              {fmtBRL(s.saldoLiquido)}
            </div>
          </div>
          <div className="surface-card p-5">
            <div className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingUp className="size-3" /> Total aportado
            </div>
            <div className="text-2xl font-semibold mt-2">{fmtBRL(s.totalAportado)}</div>
          </div>
          <div className="surface-card p-5">
            <div className="text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-1">
              <TrendingDown className="size-3" /> Resgatado
            </div>
            <div className="text-2xl font-semibold mt-2">{fmtBRL(s.totalResgatado)}</div>
          </div>
          <div className="surface-card p-5">
            <div className="text-xs text-muted-foreground uppercase tracking-wider">Lançamentos</div>
            <div className="text-2xl font-semibold mt-2">{s.count}</div>
          </div>
        </div>
      )}

      {s && s.byCategory.length > 0 && (
        <section className="grid md:grid-cols-2 gap-6">
          <div className="surface-card p-5">
            <h2 className="font-medium mb-4">Por categoria</h2>
            <div className="space-y-2">
              {s.byCategory.map((c) => (
                <div key={c.category} className="flex justify-between text-sm">
                  <span>{c.category}</span>
                  <span className="font-mono">{fmtBRL(c.total)}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="surface-card p-5">
            <h2 className="font-medium mb-4">Top corretoras / ativos</h2>
            <div className="space-y-2">
              {s.byMerchant.map((m) => (
                <div key={m.merchant} className="flex justify-between text-sm">
                  <span className="truncate pr-2">{m.merchant}</span>
                  <span className="font-mono shrink-0">{fmtBRL(m.total)}</span>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {s && s.byMonth.length > 0 && (
        <section className="surface-card p-5">
          <h2 className="font-medium mb-4">Aportes por mês</h2>
          <div className="space-y-1">
            {s.byMonth.map((m) => {
              const max = Math.max(...s.byMonth.map((x) => Math.abs(x.total)));
              const pct = max > 0 ? Math.abs(m.total) / max * 100 : 0;
              return (
                <div key={m.month} className="flex items-center gap-3 text-sm">
                  <span className="w-20 text-muted-foreground">{m.month}</span>
                  <div className="flex-1 h-2 bg-white/5 rounded">
                    <div
                      className={`h-full rounded ${m.total >= 0 ? "bg-primary" : "bg-destructive"}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="font-mono w-28 text-right">{fmtBRL(m.total)}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section>
        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">
          Lançamentos ({rows.length})
        </h2>
        {rows.length === 0 ? (
          <div className="surface-card p-10 text-center text-sm text-muted-foreground">
            Nenhum investimento marcado ainda. Em Transações, marque um lançamento como investimento.
          </div>
        ) : (
          <div className="surface-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Data</th>
                    <th className="px-3 py-2 text-left">Descrição</th>
                    <th className="px-3 py-2 text-left">Categoria</th>
                    <th className="px-3 py-2 text-right">Valor</th>
                    <th className="px-3 py-2 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {rows.map((r) => (
                    <tr key={r.id}>
                      <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{r.date}</td>
                      <td className="px-3 py-2 max-w-md truncate" title={r.description}>{r.description}</td>
                      <td className="px-3 py-2 text-xs text-muted-foreground">{r.category}</td>
                      <td className={`px-3 py-2 text-right font-mono ${r.transaction_type === "debit" ? "text-foreground" : "text-success"}`}>
                        {r.transaction_type === "debit" ? "" : "+"}{fmtBRL(Number(r.amount))}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleToggle(r.id)}
                          title="Desmarcar investimento"
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <ToggleLeft className="size-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
