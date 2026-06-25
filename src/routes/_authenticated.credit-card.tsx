import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { CreditCard, Plus, Trash2, Loader2, Upload, Save } from "lucide-react";
import { createManualTransactions } from "@/lib/investments.functions";
import { listCategories } from "@/lib/categories.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/credit-card")({
  component: CreditCardPage,
  head: () => ({ meta: [{ title: "Fatura de Cartão — Finance AI" }] }),
});

type Row = {
  _id: string;
  date: string;
  description: string;
  amount: string;
  category: string;
};

const today = () => new Date().toISOString().slice(0, 10);
const newRow = (): Row => ({ _id: Math.random().toString(36).slice(2), date: today(), description: "", amount: "", category: "Outros" });

function CreditCardPage() {
  const qc = useQueryClient();
  const fetchCategories = useServerFn(listCategories);
  const doSave = useServerFn(createManualTransactions);

  const [cardLabel, setCardLabel] = useState("");
  const [rows, setRows] = useState<Row[]>([newRow(), newRow(), newRow()]);
  const [busy, setBusy] = useState(false);

  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => fetchCategories() });

  const update = (id: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r._id === id ? { ...r, ...patch } : r)));
  const remove = (id: string) => setRows((rs) => rs.filter((r) => r._id !== id));
  const add = () => setRows((rs) => [...rs, newRow()]);

  const valid = rows.filter((r) => r.description.trim() && Number(r.amount.replace(",", ".")) > 0);
  const total = valid.reduce((s, r) => s + Number(r.amount.replace(",", ".")), 0);

  const save = async () => {
    if (valid.length === 0) {
      toast.error("Preencha ao menos uma linha com descrição e valor");
      return;
    }
    setBusy(true);
    try {
      const res = await doSave({
        data: {
          cardLabel: cardLabel.trim() || "Cartão de crédito",
          txns: valid.map((r) => ({
            date: r.date,
            description: r.description.trim(),
            amount: Number(r.amount.replace(",", ".")),
            transaction_type: "debit" as const,
            category: r.category,
            merchant: cardLabel.trim() || undefined,
            is_investment: false,
            source: "credit_card",
          })),
        },
      });
      toast.success(`${res.imported} lançamentos salvos`);
      setRows([newRow(), newRow(), newRow()]);
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setBusy(false);
    }
  };

  const fmtBRL = (n: number) =>
    new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-3xl font-semibold flex items-center gap-2">
          <CreditCard className="size-7 text-primary" /> Fatura de cartão
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Digite os lançamentos manualmente ou importe o PDF da fatura.
        </p>
      </header>

      <Link
        to="/import"
        className="surface-card surface-card-hover p-4 flex items-center gap-3 text-sm"
      >
        <Upload className="size-5 text-primary" />
        <div className="flex-1">
          <div className="font-medium">Importar PDF / CSV da fatura</div>
          <div className="text-xs text-muted-foreground">Use a Central de Importação e selecione "Fatura de cartão"</div>
        </div>
      </Link>

      <div className="surface-card p-5 space-y-4">
        <div>
          <label className="text-xs text-muted-foreground uppercase tracking-wider">Cartão / Banco</label>
          <input
            value={cardLabel}
            onChange={(e) => setCardLabel(e.target.value)}
            placeholder="Ex: Nubank Roxinho, Itaú Personnalité…"
            className="mt-1 w-full bg-transparent border border-border rounded-lg px-3 py-2 text-sm"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-2 py-2 text-left w-36">Data</th>
                <th className="px-2 py-2 text-left">Descrição</th>
                <th className="px-2 py-2 text-left w-44">Categoria</th>
                <th className="px-2 py-2 text-right w-32">Valor (R$)</th>
                <th className="px-2 py-2 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r._id} className="border-t border-border/50">
                  <td className="px-2 py-2">
                    <input
                      type="date"
                      value={r.date}
                      onChange={(e) => update(r._id, { date: e.target.value })}
                      className="bg-transparent border border-border rounded px-2 py-1 text-xs w-full"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={r.description}
                      onChange={(e) => update(r._id, { description: e.target.value })}
                      placeholder="Ex: Mercado Pão de Açúcar"
                      className="bg-transparent border border-border rounded px-2 py-1 text-xs w-full"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <select
                      value={r.category}
                      onChange={(e) => update(r._id, { category: e.target.value })}
                      className="bg-transparent border border-border rounded px-2 py-1 text-xs w-full"
                    >
                      {(categories ?? []).map((c) => (
                        <option key={c.id} value={c.name}>{c.name}</option>
                      ))}
                    </select>
                  </td>
                  <td className="px-2 py-2">
                    <input
                      value={r.amount}
                      onChange={(e) => update(r._id, { amount: e.target.value })}
                      inputMode="decimal"
                      placeholder="0,00"
                      className="bg-transparent border border-border rounded px-2 py-1 text-xs w-full text-right font-mono"
                    />
                  </td>
                  <td className="px-2 py-2">
                    <button onClick={() => remove(r._id)} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="size-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <button onClick={add} className="text-sm text-primary hover:underline flex items-center gap-1">
            <Plus className="size-3" /> Nova linha
          </button>
          <div className="text-sm text-muted-foreground">
            Total: <span className="font-mono text-foreground">{fmtBRL(total)}</span> ({valid.length} válidos)
          </div>
          <button
            onClick={save}
            disabled={busy || valid.length === 0}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar fatura
          </button>
        </div>
      </div>
    </div>
  );
}
