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

      <div className="surface-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground border-b border-border bg-muted/30">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Data</th>
                <th className="text-left px-4 py-3 font-medium">Descrição</th>
                <th className="text-left px-4 py-3 font-medium">Categoria</th>
                <th className="text-left px-4 py-3 font-medium">Tipo</th>
                <th className="text-right px-4 py-3 font-medium">Valor</th>
                <th className="px-4 py-3 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {(txns ?? []).map((t) => (
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
              {(!txns || txns.length === 0) && (
                <tr><td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">Nenhuma transação encontrada.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
