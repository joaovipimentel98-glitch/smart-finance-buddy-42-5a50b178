import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import {
  listTransactions,
  updateTransactionCategory,
  deleteTransaction,
} from "@/lib/transactions.functions";
import { toggleInvestment } from "@/lib/investments.functions";
import { listCategories } from "@/lib/categories.functions";
import {
  Search,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  TrendingUp,
  Loader2,
  Receipt,
  ArrowDownLeft,
  ArrowUpRight,
  Wallet,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type SortKey = "date" | "description" | "category" | "transaction_type";
type SortDir = "asc" | "desc";
type TypeFilter = "all" | "credit" | "debit";
type InvFilter = "all" | "only" | "hide";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TxPage,
  head: () => ({
    meta: [
      { title: "Transações — Finance AI" },
      {
        name: "description",
        content:
          "Revise, categorize e organize todas as suas transações financeiras em um só lugar.",
      },
      { property: "og:title", content: "Transações — Finance AI" },
      {
        property: "og:description",
        content:
          "Revise, categorize e organize todas as suas transações financeiras em um só lugar.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
});

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");

function TxPage() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [invFilter, setInvFilter] = useState<InvFilter>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [pendingId, setPendingId] = useState<string | null>(null);
  const qc = useQueryClient();
  const fetchTx = useServerFn(listTransactions);
  const fetchCats = useServerFn(listCategories);
  const updateCat = useServerFn(updateTransactionCategory);
  const removeTx = useServerFn(deleteTransaction);
  const doToggleInv = useServerFn(toggleInvestment);

  const {
    data: txns,
    isLoading,
    isFetching,
  } = useQuery({
    queryKey: ["transactions", search],
    queryFn: () => fetchTx({ data: { limit: 300, search: search || undefined } }),
  });
  const { data: cats } = useQuery({ queryKey: ["categories"], queryFn: () => fetchCats() });
  const catMap = new Map((cats ?? []).map((c) => [c.name, c]));

  const filteredTxns = useMemo(() => {
    return (txns ?? []).filter((t) => {
      if (typeFilter !== "all" && t.transaction_type !== typeFilter) return false;
      if (invFilter === "only" && !t.is_investment) return false;
      if (invFilter === "hide" && t.is_investment) return false;
      if (categoryFilter && t.category !== categoryFilter) return false;
      return true;
    });
  }, [txns, typeFilter, invFilter, categoryFilter]);

  const sortedTxns = useMemo(() => {
    const list = [...filteredTxns];
    const dir = sortDir === "asc" ? 1 : -1;
    const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
    list.sort((a, b) => {
      const va = (a[sortKey] ?? "") as string;
      const vb = (b[sortKey] ?? "") as string;
      if (sortKey === "date") return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
      return collator.compare(String(va), String(vb)) * dir;
    });
    return list;
  }, [filteredTxns, sortKey, sortDir]);

  const summary = useMemo(() => {
    let income = 0,
      expense = 0;
    for (const t of filteredTxns) {
      const v = Number(t.amount) || 0;
      if (t.transaction_type === "credit") income += v;
      else expense += v;
    }
    return { income, expense, net: income - expense, count: filteredTxns.length };
  }, [filteredTxns]);

  const hasActiveFilters =
    typeFilter !== "all" || invFilter !== "all" || Boolean(categoryFilter) || Boolean(search);

  const clearFilters = () => {
    setTypeFilter("all");
    setInvFilter("all");
    setCategoryFilter("");
    setSearch("");
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };

  const onChangeCat = async (id: string, category: string) => {
    setPendingId(id);
    try {
      await updateCat({ data: { id, category, createRule: true } });
      toast.success("Categoria atualizada. Regra salva.");
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setPendingId(null);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Excluir esta transação?")) return;
    setPendingId(id);
    try {
      await removeTx({ data: { id } });
      toast.success("Transação excluída");
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setPendingId(null);
    }
  };

  const onToggleInv = async (id: string, current: boolean) => {
    setPendingId(id);
    try {
      await doToggleInv({ data: { id, isInvestment: !current } });
      toast.success(!current ? "Marcado como investimento" : "Removido dos investimentos");
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["investments-summary"] });
      qc.invalidateQueries({ queryKey: ["investments-list"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setPendingId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
            <Receipt className="size-3.5" /> Movimentações
          </div>
          <h1 className="text-2xl sm:text-3xl font-semibold mt-1">Transações</h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            Edite a categoria para ensinar o sistema — uma regra é criada automaticamente.
          </p>
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          {isFetching && !isLoading && <Loader2 className="size-3.5 animate-spin" />}
          {summary.count} {summary.count === 1 ? "lançamento" : "lançamentos"}
        </div>
      </header>

      {/* Resumo financeiro */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <SummaryCard
          label="Entradas"
          value={fmtBRL(summary.income)}
          icon={<ArrowDownLeft className="size-4" />}
          tone="text-success"
        />
        <SummaryCard
          label="Saídas"
          value={fmtBRL(summary.expense)}
          icon={<ArrowUpRight className="size-4" />}
          tone="text-destructive"
        />
        <SummaryCard
          label="Saldo do período"
          value={fmtBRL(summary.net)}
          icon={<Wallet className="size-4" />}
          tone={summary.net >= 0 ? "text-success" : "text-destructive"}
        />
      </div>

      {/* Busca + filtros */}
      <div className="surface-card p-3 sm:p-4 mb-4 space-y-3">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground shrink-0" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por descrição..."
            className="border-0 bg-transparent focus-visible:ring-0"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              aria-label="Limpar busca"
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <FilterGroup
            label="Tipo"
            options={[
              ["all", "Todos"],
              ["credit", "Entradas"],
              ["debit", "Saídas"],
            ]}
            value={typeFilter}
            onChange={(v) => setTypeFilter(v as TypeFilter)}
          />
          <FilterGroup
            label="Investimentos"
            options={[
              ["all", "Todos"],
              ["only", "Somente"],
              ["hide", "Ocultar"],
            ]}
            value={invFilter}
            onChange={(v) => setInvFilter(v as InvFilter)}
          />
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
              Categoria
            </span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="bg-secondary/50 border border-border rounded-md text-xs px-2 py-1.5 focus:outline-none focus:border-primary"
            >
              <option value="">Todas</option>
              {(cats ?? []).map((c) => (
                <option key={c.id ?? c.name} value={c.name}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              className="ml-auto text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
            >
              <X className="size-3" /> Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* Mobile sort toolbar */}
      <div className="md:hidden surface-card p-2 mb-3 flex items-center gap-2 overflow-x-auto">
        <span className="text-[11px] text-muted-foreground px-1 shrink-0">Ordenar:</span>
        {(
          [
            ["date", "Data"],
            ["category", "Categoria"],
            ["transaction_type", "Tipo"],
            ["description", "Descrição"],
          ] as [SortKey, string][]
        ).map(([k, label]) => {
          const active = sortKey === k;
          const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
          return (
            <button
              key={k}
              type="button"
              onClick={() => toggleSort(k)}
              aria-pressed={active}
              className={`shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border transition ${
                active
                  ? "bg-primary/15 border-primary/30 text-foreground"
                  : "bg-secondary/40 border-border text-muted-foreground"
              }`}
            >
              {label}
              <Icon className="size-3" />
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <LoadingState />
      ) : sortedTxns.length === 0 ? (
        <EmptyState hasFilters={hasActiveFilters} onClear={clearFilters} />
      ) : (
        <>
          {/* Mobile card list */}
          <div className="md:hidden space-y-2">
            {sortedTxns.map((t) => (
              <div
                key={t.id}
                className={`surface-card p-3 transition ${pendingId === t.id ? "opacity-60" : ""}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] text-muted-foreground">{fmtDate(t.date)}</div>
                    <div className="text-sm font-medium truncate">{t.description}</div>
                    <div className="mt-2 flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 text-xs">
                        <span
                          className="size-2.5 rounded-full shrink-0"
                          style={{ background: catMap.get(t.category)?.color || "#64748b" }}
                        />
                        <select
                          value={t.category}
                          disabled={pendingId === t.id}
                          onChange={(e) => onChangeCat(t.id, e.target.value)}
                          className="bg-secondary/50 border border-border rounded-md text-xs px-2 py-1 max-w-[140px] focus:outline-none focus:border-primary disabled:opacity-50"
                        >
                          {(cats?.map((c) => c.name) ?? [t.category]).map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-md ${t.transaction_type === "credit" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}
                      >
                        {t.transaction_type === "credit" ? "Entrada" : "Saída"}
                      </span>
                      {t.is_investment && (
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-primary/15 text-primary">
                          Investimento
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <div
                      className={`text-sm font-semibold whitespace-nowrap ${t.transaction_type === "credit" ? "text-success" : "text-destructive"}`}
                    >
                      {fmtBRL(Number(t.amount))}
                    </div>
                    <div className="flex items-center gap-1">
                      {pendingId === t.id ? (
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      ) : (
                        <>
                          <button
                            onClick={() => onToggleInv(t.id, t.is_investment)}
                            aria-label="Marcar como investimento"
                            title={
                              t.is_investment
                                ? "É investimento — clique para desmarcar"
                                : "Marcar como investimento"
                            }
                            className={`p-1 rounded-md transition ${t.is_investment ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`}
                          >
                            <TrendingUp className="size-4" />
                          </button>
                          <button
                            onClick={() => onDelete(t.id)}
                            aria-label="Excluir"
                            className="text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-md transition p-1"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop table */}
          <div className="surface-card overflow-hidden hidden md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-muted-foreground border-b border-border bg-muted/30">
                  <tr>
                    <SortableTh
                      label="Data"
                      col="date"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onClick={toggleSort}
                    />
                    <SortableTh
                      label="Descrição"
                      col="description"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onClick={toggleSort}
                    />
                    <SortableTh
                      label="Categoria"
                      col="category"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onClick={toggleSort}
                    />
                    <SortableTh
                      label="Tipo"
                      col="transaction_type"
                      sortKey={sortKey}
                      sortDir={sortDir}
                      onClick={toggleSort}
                    />
                    <th className="text-right px-4 py-3 font-medium">Valor</th>
                    <th className="px-4 py-3 w-24 text-right font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedTxns.map((t) => (
                    <tr
                      key={t.id}
                      className={`border-b border-border/40 hover:bg-white/[0.03] transition ${pendingId === t.id ? "opacity-60" : ""}`}
                    >
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        {fmtDate(t.date)}
                      </td>
                      <td className="px-4 py-3 max-w-xs">
                        <div className="truncate" title={t.description}>
                          {t.description}
                        </div>
                        {t.is_investment && (
                          <span className="text-[10px] text-primary">Investimento</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span
                            className="size-2.5 rounded-full shrink-0"
                            style={{ background: catMap.get(t.category)?.color || "#64748b" }}
                          />
                          <select
                            value={t.category}
                            disabled={pendingId === t.id}
                            onChange={(e) => onChangeCat(t.id, e.target.value)}
                            className="bg-secondary/50 border border-border rounded-md text-xs px-2 py-1 focus:outline-none focus:border-primary disabled:opacity-50"
                          >
                            {(cats?.map((c) => c.name) ?? [t.category]).map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                          {Number(t.confidence) < 0.7 && (
                            <span className="text-[10px] text-warning">
                              ~{Math.round(Number(t.confidence) * 100)}%
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs px-2 py-0.5 rounded-md ${t.transaction_type === "credit" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}
                        >
                          {t.transaction_type === "credit" ? "Entrada" : "Saída"}
                        </span>
                      </td>
                      <td
                        className={`px-4 py-3 text-right font-medium ${t.transaction_type === "credit" ? "text-success" : "text-destructive"}`}
                      >
                        {fmtBRL(Number(t.amount))}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          {pendingId === t.id ? (
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                          ) : (
                            <>
                              <button
                                onClick={() => onToggleInv(t.id, t.is_investment)}
                                title={
                                  t.is_investment
                                    ? "É investimento — clique para desmarcar"
                                    : "Marcar como investimento"
                                }
                                className={`p-1.5 rounded-md transition ${t.is_investment ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-primary hover:bg-primary/10"}`}
                              >
                                <TrendingUp className="size-4" />
                              </button>
                              <button
                                onClick={() => onDelete(t.id)}
                                title="Excluir transação"
                                className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                              >
                                <Trash2 className="size-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon,
  tone,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: string;
}) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
        <span>{label}</span>
        <span className={tone}>{icon}</span>
      </div>
      <div className={`mt-2 text-xl font-semibold ${tone}`}>{value}</div>
    </div>
  );
}

function FilterGroup({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: [string, string][];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <div className="inline-flex rounded-md border border-border overflow-hidden">
        {options.map(([v, l]) => (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            aria-pressed={value === v}
            className={`px-2.5 py-1.5 text-xs transition ${value === v ? "bg-primary/20 text-foreground" : "text-muted-foreground hover:bg-white/5"}`}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="surface-card p-4 animate-pulse">
          <div className="h-3 w-24 bg-white/10 rounded mb-3" />
          <div className="h-4 w-2/3 bg-white/10 rounded" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasFilters, onClear }: { hasFilters: boolean; onClear: () => void }) {
  return (
    <div className="surface-card p-12 text-center">
      <Receipt className="size-10 mx-auto text-muted-foreground/60" />
      <h3 className="mt-4 font-medium">Nenhuma transação encontrada</h3>
      <p className="text-sm text-muted-foreground mt-1">
        {hasFilters
          ? "Tente ajustar a busca ou os filtros aplicados."
          : "Importe um extrato para começar a acompanhar seus gastos."}
      </p>
      {hasFilters && (
        <button
          onClick={onClear}
          className="mt-4 px-4 py-2 rounded-lg border border-border text-sm hover:bg-white/5"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );
}

function SortableTh({
  label,
  col,
  sortKey,
  sortDir,
  onClick,
}: {
  label: string;
  col: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
}) {
  const active = sortKey === col;
  const Icon = !active ? ArrowUpDown : sortDir === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className="text-left px-4 py-3 font-medium">
      <button
        type="button"
        onClick={() => onClick(col)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition ${active ? "text-foreground" : ""}`}
      >
        {label}
        <Icon className="size-3" />
      </button>
    </th>
  );
}
