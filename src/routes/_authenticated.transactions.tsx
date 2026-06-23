import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listTransactions, updateTransactionCategory, deleteTransaction } from "@/lib/transactions.functions";
import { listCategories } from "@/lib/categories.functions";
import { Search, Trash2, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

type SortKey = "date" | "description" | "category" | "transaction_type";
type SortDir = "asc" | "desc";

export const Route = createFileRoute("/_authenticated/transactions")({
  component: TxPage,
  head: () => ({ meta: [{ title: "Transações — Finance AI" }] }),
});

const fmtBRL = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const fmtDate = (d: string) => new Date(d).toLocaleDateString("pt-BR");

function TxPage() {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("date");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const qc = useQueryClient();
  const fetchTx = useServerFn(listTransactions);
  const fetchCats = useServerFn(listCategories);
  const updateCat = useServerFn(updateTransactionCategory);
  const removeTx = useServerFn(deleteTransaction);

  const { data: txns } = useQuery({
    queryKey: ["transactions", search],
    queryFn: () => fetchTx({ data: { limit: 300, search: search || undefined } }),
  });
  const { data: cats } = useQuery({ queryKey: ["categories"], queryFn: () => fetchCats() });
  const catMap = new Map((cats ?? []).map((c) => [c.name, c]));

  const sortedTxns = useMemo(() => {
    const list = [...(txns ?? [])];
    const dir = sortDir === "asc" ? 1 : -1;
    const collator = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });
    list.sort((a, b) => {
      const va = (a[sortKey] ?? "") as string;
      const vb = (b[sortKey] ?? "") as string;
      if (sortKey === "date") return (va < vb ? -1 : va > vb ? 1 : 0) * dir;
      return collator.compare(String(va), String(vb)) * dir;
    });
    return list;
  }, [txns, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(key);
      setSortDir(key === "date" ? "desc" : "asc");
    }
  };


  const onChangeCat = async (id: string, category: string) => {
    try {
      await updateCat({ data: { id, category, createRule: true } });
      toast.success("Categoria atualizada. Regra salva.");
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Excluir esta transação?")) return;
    try {
      await removeTx({ data: { id } });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">Transações</h1>
        <p className="text-sm text-muted-foreground mt-1">Edite a categoria para ensinar o sistema — uma regra é criada automaticamente.</p>
      </header>
      <div className="surface-card p-4 mb-4 flex items-center gap-2">
        <Search className="size-4 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por descrição..." className="border-0 bg-transparent focus-visible:ring-0" />
      </div>

      {/* Mobile sort toolbar */}
      <div className="md:hidden surface-card p-2 mb-3 flex items-center gap-2 overflow-x-auto">
        <span className="text-[11px] text-muted-foreground px-1 shrink-0">Ordenar:</span>
        {([
          ["date", "Data"],
          ["category", "Categoria"],
          ["transaction_type", "Tipo"],
          ["description", "Descrição"],
        ] as [SortKey, string][]).map(([k, label]) => {
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

      {/* Mobile card list */}
      <div className="md:hidden space-y-2">
        {sortedTxns.map((t) => (
          <div key={t.id} className="surface-card p-3">
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
                      onChange={(e) => onChangeCat(t.id, e.target.value)}
                      className="bg-secondary/50 border border-border rounded-md text-xs px-2 py-1 max-w-[140px] focus:outline-none focus:border-primary"
                    >
                      {(cats?.map((c) => c.name) ?? [t.category]).map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </span>
                  <span className={`text-[10px] px-2 py-0.5 rounded-md ${t.transaction_type === "credit" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                    {t.transaction_type === "credit" ? "Entrada" : "Saída"}
                  </span>
                </div>
              </div>
              <div className="flex flex-col items-end gap-2 shrink-0">
                <div className={`text-sm font-semibold whitespace-nowrap ${t.transaction_type === "credit" ? "text-success" : "text-destructive"}`}>
                  {fmtBRL(Number(t.amount))}
                </div>
                <button onClick={() => onDelete(t.id)} aria-label="Excluir" className="text-muted-foreground hover:text-destructive transition p-1">
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          </div>
        ))}
        {sortedTxns.length === 0 && (
          <div className="surface-card p-8 text-center text-muted-foreground text-sm">Nenhuma transação encontrada.</div>
        )}
      </div>

      {/* Desktop table */}
      <div className="surface-card overflow-hidden hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border bg-muted/30">
              <tr>
                <SortableTh label="Data" col="date" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Descrição" col="description" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Categoria" col="category" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <SortableTh label="Tipo" col="transaction_type" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                <th className="text-right px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {sortedTxns.map((t) => (
                <tr key={t.id} className="border-b border-border/40 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{fmtDate(t.date)}</td>
                  <td className="px-4 py-3 max-w-xs truncate">{t.description}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 rounded-full shrink-0"
                        style={{ background: catMap.get(t.category)?.color || "#64748b" }}
                      />
                      <select
                        value={t.category}
                        onChange={(e) => onChangeCat(t.id, e.target.value)}
                        className="bg-secondary/50 border border-border rounded-md text-xs px-2 py-1 focus:outline-none focus:border-primary"
                      >
                        {(cats?.map((c) => c.name) ?? [t.category]).map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                      {Number(t.confidence) < 0.7 && (
                        <span className="text-[10px] text-warning">~{Math.round(Number(t.confidence) * 100)}%</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-md ${t.transaction_type === "credit" ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
                      {t.transaction_type === "credit" ? "Entrada" : "Saída"}
                    </span>
                  </td>
                  <td className={`px-4 py-3 text-right font-medium ${t.transaction_type === "credit" ? "text-success" : "text-destructive"}`}>
                    {fmtBRL(Number(t.amount))}
                  </td>
                  <td className="px-4 py-3">
                    <button onClick={() => onDelete(t.id)} className="text-muted-foreground hover:text-destructive transition">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {sortedTxns.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Nenhuma transação encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

function SortableTh({
  label, col, sortKey, sortDir, onClick,
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
