import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { previewImport, commitImport, listUploads, updateUpload, deleteUpload, type PreviewTxn } from "@/lib/imports.functions";
import { listCategories, createCategory } from "@/lib/categories.functions";
import { getProfile } from "@/lib/profile.functions";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Trash2, Plus, X, Landmark } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
  head: () => ({ meta: [{ title: "Importar — Finance AI" }] }),
});

type PreviewState = {
  fileName: string;
  fileType: string;
  txns: (PreviewTxn & { _id: string; _keep: boolean })[];
};

const fmtBRL = (n: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(n);

function ImportPage() {
  const qc = useQueryClient();
  const fetchUploads = useServerFn(listUploads);
  const fetchCategories = useServerFn(listCategories);
  const addCategory = useServerFn(createCategory);
  const doPreview = useServerFn(previewImport);
  const doCommit = useServerFn(commitImport);

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"idle" | "previewing" | "committing">("idle");
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [source, setSource] = useState<"import" | "credit_card">("import");
  const [isInvestment, setIsInvestment] = useState(false);

  const { data: uploads } = useQuery({ queryKey: ["uploads"], queryFn: () => fetchUploads() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => fetchCategories() });
  const categoryNames = useMemo(() => (categories ?? []).map((c) => c.name), [categories]);

  const handleFiles = async (files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file) return;
    setBusy("previewing");
    try {
      const buf = await file.arrayBuffer();
      const bytes = new Uint8Array(buf);
      let binary = "";
      const CHUNK = 0x8000;
      for (let i = 0; i < bytes.length; i += CHUNK) {
        binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
      }
      const base64 = btoa(binary);
      const res = await doPreview({ data: { fileName: file.name, fileType: file.type || "application/octet-stream", base64 } });
      if (res.txns.length === 0) {
        toast.warning("Nenhuma transação encontrada no arquivo");
        setPreview(null);
        return;
      }
      setPreview({
        fileName: res.fileName,
        fileType: res.fileType,
        txns: res.txns.map((t, i) => ({ ...t, _id: `${i}`, _keep: true })),
      });
      toast.success(`${res.txns.length} transações prontas para revisar`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao processar arquivo", { duration: 8000 });
    } finally {
      setBusy("idle");
    }
  };

  const updateTxn = (id: string, patch: Partial<PreviewTxn & { _keep: boolean }>) => {
    if (!preview) return;
    setPreview({ ...preview, txns: preview.txns.map((t) => (t._id === id ? { ...t, ...patch } : t)) });
  };

  const handleCommit = async () => {
    if (!preview) return;
    const toSave = preview.txns.filter((t) => t._keep);
    if (toSave.length === 0) { toast.error("Nenhuma transação selecionada"); return; }
    setBusy("committing");
    try {
      const res = await doCommit({
        data: {
          fileName: preview.fileName,
          fileType: preview.fileType,
          source,
          isInvestment,
          txns: toSave.map(({ _id, _keep, ...t }) => t),
        },
      });
      toast.success(`${res.imported} transações salvas`);
      setPreview(null);
      qc.invalidateQueries({ queryKey: ["uploads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar", { duration: 8000 });
    } finally {
      setBusy("idle");
    }
  };

  const handleAddCategory = async () => {
    const name = newCatName.trim();
    if (!name) return;
    try {
      await addCategory({ data: { name } });
      qc.invalidateQueries({ queryKey: ["categories"] });
      toast.success(`Categoria "${name}" criada`);
      setNewCatName("");
      setNewCatOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar categoria");
    }
  };

  // ============ Preview view ============
  if (preview) {
    const kept = preview.txns.filter((t) => t._keep).length;
    const totalDebit = preview.txns.filter((t) => t._keep && t.transaction_type === "debit").reduce((s, t) => s + t.amount, 0);
    const totalCredit = preview.txns.filter((t) => t._keep && t.transaction_type === "credit").reduce((s, t) => s + t.amount, 0);
    return (
      <div className="p-6 md:p-10 max-w-7xl mx-auto">
        <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold">Revisar importação</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {preview.fileName} · {kept} de {preview.txns.length} transações selecionadas
            </p>
            <div className="flex gap-4 mt-2 text-xs">
              <span className="text-success">Entradas: {fmtBRL(totalCredit)}</span>
              <span className="text-destructive">Saídas: {fmtBRL(totalDebit)}</span>
              <span className="text-muted-foreground">Líquido: {fmtBRL(totalCredit - totalDebit)}</span>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setPreview(null)}
              className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-white/5"
              disabled={busy !== "idle"}
            >Descartar</button>
            <button
              onClick={handleCommit}
              disabled={busy !== "idle" || kept === 0}
              className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {busy === "committing" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Confirmar e salvar ({kept})
            </button>
          </div>
        </header>

        <div className="surface-card p-4 mb-4 flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Origem:</span>
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setSource("import")}
                className={`px-3 py-1.5 text-xs ${source === "import" ? "bg-primary text-primary-foreground" : "hover:bg-white/5"}`}
              >Banco / extrato</button>
              <button
                type="button"
                onClick={() => setSource("credit_card")}
                className={`px-3 py-1.5 text-xs ${source === "credit_card" ? "bg-primary text-primary-foreground" : "hover:bg-white/5"}`}
              >Fatura de cartão</button>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isInvestment}
              onChange={(e) => setIsInvestment(e.target.checked)}
              className="accent-primary"
            />
            <span className="text-xs">Marcar tudo como <strong>Investimento</strong> (fica fora do gasto mensal)</span>
          </label>
        </div>


        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 text-left w-10"></th>
                  <th className="px-3 py-2 text-left">Data</th>
                  <th className="px-3 py-2 text-left">Descrição</th>
                  <th className="px-3 py-2 text-left">Tipo</th>
                  <th className="px-3 py-2 text-left">Categoria</th>
                  <th className="px-3 py-2 text-right">Valor</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {preview.txns.map((t) => (
                  <tr key={t._id} className={t._keep ? "" : "opacity-40"}>
                    <td className="px-3 py-2">
                      <input type="checkbox" checked={t._keep} onChange={(e) => updateTxn(t._id, { _keep: e.target.checked })} className="accent-primary" />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">{t.date}</td>
                    <td className="px-3 py-2 max-w-md truncate" title={t.description}>{t.description}</td>
                    <td className="px-3 py-2">
                      <select
                        value={t.transaction_type}
                        onChange={(e) => updateTxn(t._id, { transaction_type: e.target.value as "credit" | "debit" })}
                        className="bg-transparent border border-border rounded px-2 py-1 text-xs"
                      >
                        <option value="debit">Saída</option>
                        <option value="credit">Entrada</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select
                        value={t.category}
                        onChange={(e) => {
                          if (e.target.value === "__new__") { setNewCatOpen(true); return; }
                          updateTxn(t._id, { category: e.target.value });
                        }}
                        className="bg-transparent border border-border rounded px-2 py-1 text-xs max-w-[180px]"
                      >
                        {!categoryNames.includes(t.category) && <option value={t.category}>{t.category}</option>}
                        {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
                        <option value="__new__">+ Nova categoria…</option>
                      </select>
                    </td>
                    <td className={`px-3 py-2 text-right font-mono ${t.transaction_type === "debit" ? "text-destructive" : "text-success"}`}>
                      {t.transaction_type === "debit" ? "−" : "+"}{fmtBRL(t.amount)}
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => updateTxn(t._id, { _keep: false })} className="text-muted-foreground hover:text-destructive" title="Remover">
                        <Trash2 className="size-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {newCatOpen && (
          <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" onClick={() => setNewCatOpen(false)}>
            <div className="surface-card p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium">Nova categoria</h3>
                <button onClick={() => setNewCatOpen(false)}><X className="size-4" /></button>
              </div>
              <input
                autoFocus
                value={newCatName}
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
                placeholder="Ex: Pet, Filhos, Hobby…"
                className="w-full bg-transparent border border-border rounded-lg px-3 py-2 text-sm mb-3"
              />
              <button
                onClick={handleAddCategory}
                disabled={!newCatName.trim()}
                className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
              >Criar categoria</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============ Upload view ============
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">Central de Importação</h1>
        <p className="text-sm text-muted-foreground mt-1">Aceita OFX, CSV, XLSX, PDF e imagens. Você revisa tudo antes de salvar.</p>
      </header>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`surface-card cursor-pointer p-12 text-center transition border-dashed ${dragOver ? "border-primary bg-primary/5" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".ofx,.csv,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp,image/*"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        {busy === "previewing" ? (
          <Loader2 className="size-10 mx-auto text-primary animate-spin" />
        ) : (
          <Upload className="size-10 mx-auto text-primary" />
        )}
        <h3 className="mt-4 text-lg font-medium">{busy === "previewing" ? "Analisando arquivo..." : "Arraste um arquivo aqui"}</h3>
        <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar</p>
        <p className="text-xs text-muted-foreground mt-4">OFX • CSV • XLSX • PDF • JPG • PNG</p>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Categorias</h2>
          <button onClick={() => setNewCatOpen(true)} className="text-xs flex items-center gap-1 text-primary hover:underline">
            <Plus className="size-3" /> Nova
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-8">
          {(categories ?? []).map((c) => (
            <span key={c.id} className="px-3 py-1 rounded-full bg-white/5 text-xs border border-border flex items-center gap-1.5">
              <span className="size-2 rounded-full" style={{ background: c.color || "#64748b" }} />
              {c.name}
            </span>
          ))}
        </div>

        <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider mb-4">Histórico de uploads</h2>
        <div className="space-y-2">
          {(uploads ?? []).map((u) => (
            <div key={u.id} className="surface-card p-4 flex items-center gap-4">
              <FileText className="size-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{u.file_name}</div>
                <div className="text-xs text-muted-foreground">
                  {new Date(u.upload_date).toLocaleString("pt-BR")} · {u.file_type.toUpperCase()} · {u.records_found} registros
                  {u.observations && ` · ${u.observations}`}
                </div>
              </div>
              {u.processed ? (
                u.records_found > 0 ? (
                  <CheckCircle2 className="size-5 text-success shrink-0" />
                ) : (
                  <AlertCircle className="size-5 text-warning shrink-0" />
                )
              ) : (
                <Loader2 className="size-5 text-muted-foreground animate-spin shrink-0" />
              )}
            </div>
          ))}
          {(!uploads || uploads.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum arquivo importado ainda.</p>
          )}
        </div>
      </section>

      {newCatOpen && (
        <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" onClick={() => setNewCatOpen(false)}>
          <div className="surface-card p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium">Nova categoria</h3>
              <button onClick={() => setNewCatOpen(false)}><X className="size-4" /></button>
            </div>
            <input
              autoFocus
              value={newCatName}
              onChange={(e) => setNewCatName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddCategory()}
              placeholder="Ex: Pet, Filhos, Hobby…"
              className="w-full bg-transparent border border-border rounded-lg px-3 py-2 text-sm mb-3"
            />
            <button
              onClick={handleAddCategory}
              disabled={!newCatName.trim()}
              className="w-full px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
            >Criar categoria</button>
          </div>
        </div>
      )}
    </div>
  );
}
