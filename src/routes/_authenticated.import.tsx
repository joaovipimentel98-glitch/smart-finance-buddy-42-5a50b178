import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { previewImport, commitImport, listUploads, updateUpload, deleteUpload, type PreviewTxn } from "@/lib/imports.functions";
import { listCategories, createCategory } from "@/lib/categories.functions";
import { getProfile } from "@/lib/profile.functions";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2, Trash2, Plus, X, Landmark, Sparkles, ShieldCheck, ArrowRight, FileCheck2, Database, Clock3 } from "lucide-react";
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
  const fetchProfile = useServerFn(getProfile);
  const addCategory = useServerFn(createCategory);
  const doPreview = useServerFn(previewImport);
  const doCommit = useServerFn(commitImport);
  const doUpdateUpload = useServerFn(updateUpload);
  const doDeleteUpload = useServerFn(deleteUpload);

  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"idle" | "previewing" | "committing">("idle");
  const [dragOver, setDragOver] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [source, setSource] = useState<"import" | "credit_card">("import");
  const [isInvestment, setIsInvestment] = useState(false);
  const [bank, setBank] = useState<string>("");
  const [selectedUploads, setSelectedUploads] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: uploads } = useQuery({ queryKey: ["uploads"], queryFn: () => fetchUploads() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => fetchCategories() });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const banks: string[] = useMemo(() => (profile as { banks?: string[] } | undefined)?.banks ?? [], [profile]);
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
          bank: bank.trim() || null,
          txns: toSave.map(({ _id, _keep, ...t }) => t),
        },
      });
      toast.success(`${res.imported} transações salvas`);
      setPreview(null);
      setBank("");
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
      <div className="mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
        <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[11px] font-medium text-primary"><FileCheck2 className="size-3.5" />Etapa final · revisão</div><h1 className="text-2xl font-semibold tracking-tight">Revisar importação</h1>
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

        <div className="mb-4 grid gap-3 sm:grid-cols-3">
          <div className="surface-card p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Database className="size-3.5" />Selecionadas</div><p className="mt-2 text-xl font-semibold">{kept}</p></div>
          <div className="surface-card p-4"><div className="flex items-center gap-2 text-xs text-success"><ArrowRight className="size-3.5" />Entradas</div><p className="mt-2 text-xl font-semibold text-success">{fmtBRL(totalCredit)}</p></div>
          <div className="surface-card p-4"><div className="flex items-center gap-2 text-xs text-destructive"><ArrowRight className="size-3.5" />Saídas</div><p className="mt-2 text-xl font-semibold text-destructive">{fmtBRL(totalDebit)}</p></div>
        </div>

        <div className="surface-card mb-4 flex flex-wrap items-center gap-4 p-4 text-sm">
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
          <div className="flex items-center gap-2">
            <Landmark className="size-4 text-muted-foreground" />
            <input
              list="bank-suggestions"
              value={bank}
              onChange={(e) => setBank(e.target.value)}
              placeholder="Banco (ex: Nubank, Itaú)"
              className="bg-transparent border border-border rounded-lg px-2 py-1 text-xs w-48"
            />
            <datalist id="bank-suggestions">
              {banks.map((b) => <option key={b} value={b} />)}
            </datalist>
          </div>
        </div>


        <div className="surface-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border/50 bg-muted/15 text-[10px] uppercase tracking-wider text-muted-foreground">
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
                  <tr key={t._id} className={`${t._keep ? "transition-colors hover:bg-primary/[0.02]" : "opacity-35"} border-b border-border/35`}>
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
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm" onClick={() => setNewCatOpen(false)}>
            <div className="surface-card w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >Criar categoria</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============ Upload view ============
  return (
    <div className="mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8 lg:py-9">
      <header className="mb-7">
        <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-primary/15 bg-primary/8 px-3 py-1 text-[11px] font-medium text-primary">
          <Sparkles className="size-3.5" />
          Entrada inteligente de dados
        </div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Central de Importação</h1>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
          Envie seu extrato ou fatura. A IA organiza os lançamentos e você revisa tudo antes de salvar.
        </p>
      </header>

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => inputRef.current?.click()}
        className={`surface-card group cursor-pointer overflow-hidden border-dashed p-7 text-center transition sm:p-12 ${dragOver ? "border-primary bg-primary/5 shadow-lg shadow-primary/5" : "hover:border-primary/30 hover:bg-primary/[0.02]"}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".ofx,.csv,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp,image/*"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        {busy === "previewing" ? (
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Loader2 className="size-7 animate-spin" /></div>
        ) : (
          <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:scale-105"><Upload className="size-7" /></div>
        )}
        <h3 className="mt-5 text-base font-semibold sm:text-lg">{busy === "previewing" ? "Analisando arquivo..." : "Arraste seu arquivo aqui"}</h3>
        <p className="mt-1 text-sm text-muted-foreground">ou clique para selecionar no computador</p>
        <div className="mx-auto mt-5 flex max-w-md flex-wrap items-center justify-center gap-2 text-[10px] font-medium text-muted-foreground"><span className="rounded-md bg-secondary/50 px-2 py-1">OFX</span><span className="rounded-md bg-secondary/50 px-2 py-1">CSV</span><span className="rounded-md bg-secondary/50 px-2 py-1">XLSX</span><span className="rounded-md bg-secondary/50 px-2 py-1">PDF</span><span className="rounded-md bg-secondary/50 px-2 py-1">JPG</span><span className="rounded-md bg-secondary/50 px-2 py-1">PNG</span></div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="surface-card flex items-center gap-3 p-3.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-success/10 text-success"><ShieldCheck className="size-4" /></div>
          <div><p className="text-xs font-semibold">Você revisa antes</p><p className="mt-0.5 text-[10px] text-muted-foreground">Nada é salvo sem confirmação.</p></div>
        </div>
        <div className="surface-card flex items-center gap-3 p-3.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Sparkles className="size-4" /></div>
          <div><p className="text-xs font-semibold">Classificação inteligente</p><p className="mt-0.5 text-[10px] text-muted-foreground">Categorias sugeridas automaticamente.</p></div>
        </div>
        <div className="surface-card flex items-center gap-3 p-3.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary text-muted-foreground"><FileCheck2 className="size-4" /></div>
          <div><p className="text-xs font-semibold">Vários formatos</p><p className="mt-0.5 text-[10px] text-muted-foreground">Extratos, faturas e imagens.</p></div>
        </div>
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between mb-4">
          <div><h2 className="text-sm font-semibold">Categorias</h2><p className="mt-0.5 text-xs text-muted-foreground">Usadas para organizar e classificar seus lançamentos.</p></div>
          <button onClick={() => setNewCatOpen(true)} className="text-xs flex items-center gap-1 text-primary hover:underline">
            <Plus className="size-3" /> Nova
          </button>
        </div>
        <div className="flex flex-wrap gap-2 mb-8">
          {(categories ?? []).map((c) => (
            <span key={c.id} className="inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-secondary/30 px-3 py-1.5 text-xs transition hover:bg-secondary/60">
              <span className="size-2 rounded-full" style={{ background: c.color || "#64748b" }} />
              {c.name}
            </span>
          ))}
        </div>

        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div><h2 className="text-sm font-semibold">Histórico de importações</h2><p className="mt-0.5 text-xs text-muted-foreground">Arquivos processados anteriormente.</p></div>
          {(uploads ?? []).length > 0 && (
            <div className="flex items-center gap-2 text-xs">
              <label className="flex items-center gap-1.5 cursor-pointer text-muted-foreground hover:text-foreground">
                <input
                  type="checkbox"
                  className="accent-primary"
                  checked={selectedUploads.size > 0 && selectedUploads.size === (uploads ?? []).length}
                  ref={(el) => { if (el) el.indeterminate = selectedUploads.size > 0 && selectedUploads.size < (uploads ?? []).length; }}
                  onChange={(e) => {
                    setSelectedUploads(e.target.checked ? new Set((uploads ?? []).map((u) => u.id)) : new Set());
                  }}
                />
                Selecionar todos
              </label>
              <button
                disabled={selectedUploads.size === 0 || bulkDeleting}
                onClick={async () => {
                  const ids = Array.from(selectedUploads);
                  const totalRecords = (uploads ?? [])
                    .filter((u) => selectedUploads.has(u.id))
                    .reduce((s, u) => s + (u.records_found ?? 0), 0);
                  if (!confirm(`Apagar ${ids.length} arquivo(s) e ${totalRecords} transações relacionadas?`)) return;
                  setBulkDeleting(true);
                  let okCount = 0;
                  let txnCount = 0;
                  const failed: string[] = [];
                  for (const id of ids) {
                    try {
                      const res = await doDeleteUpload({ data: { id, deleteTransactions: true } });
                      okCount += 1;
                      txnCount += res.deletedTransactions ?? 0;
                    } catch (err) {
                      failed.push(err instanceof Error ? err.message : String(err));
                    }
                  }
                  setBulkDeleting(false);
                  setSelectedUploads(new Set());
                  qc.invalidateQueries({ queryKey: ["uploads"] });
                  qc.invalidateQueries({ queryKey: ["transactions"] });
                  qc.invalidateQueries({ queryKey: ["dashboard"] });
                  if (failed.length === 0) {
                    toast.success(`${okCount} arquivo(s) apagado(s) · ${txnCount} transações removidas`);
                  } else {
                    toast.error(`${okCount} ok, ${failed.length} falhou(aram): ${failed[0]}`, { duration: 8000 });
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-destructive/15 text-destructive text-xs font-medium hover:bg-destructive/25 disabled:opacity-40 disabled:hover:bg-destructive/15 flex items-center gap-1.5"
              >
                {bulkDeleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                Excluir selecionados {selectedUploads.size > 0 && `(${selectedUploads.size})`}
              </button>
            </div>
          )}
        </div>
        <div className="space-y-2">
          {(uploads ?? []).map((u) => (
            <div key={u.id} className={`surface-card group flex items-center gap-3.5 p-3.5 transition sm:p-4 ${selectedUploads.has(u.id) ? "ring-1 ring-primary/40 bg-primary/[0.025]" : "hover:bg-primary/[0.02]"}`}>
              <input
                type="checkbox"
                className="accent-primary"
                checked={selectedUploads.has(u.id)}
                onChange={(e) => {
                  setSelectedUploads((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.add(u.id); else next.delete(u.id);
                    return next;
                  });
                }}
              />
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary"><FileText className="size-4.5" /></div>
              <div className="min-w-[180px] flex-1">
                <div className="truncate text-sm font-semibold">{u.file_name}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {new Date(u.upload_date).toLocaleString("pt-BR")} · {u.file_type.toUpperCase()} · {u.records_found} registros
                  {u.observations && ` · ${u.observations}`}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Landmark className="size-4 text-muted-foreground" />
                <input
                  list="bank-suggestions"
                  defaultValue={(u as { bank?: string | null }).bank ?? ""}
                  onBlur={async (e) => {
                    const next = e.target.value.trim() || null;
                    const current = (u as { bank?: string | null }).bank ?? null;
                    if (next === current) return;
                    try {
                      await doUpdateUpload({ data: { id: u.id, bank: next } });
                      toast.success("Banco atualizado");
                      qc.invalidateQueries({ queryKey: ["uploads"] });
                      qc.invalidateQueries({ queryKey: ["transactions"] });
                    } catch (err) {
                      toast.error(err instanceof Error ? err.message : "Erro ao atualizar");
                    }
                  }}
                  placeholder="Banco"
                  className="h-8 w-40 rounded-lg border border-border/50 bg-secondary/25 px-2.5 text-xs outline-none transition focus:border-primary/40 focus:ring-2 focus:ring-primary/10"
                />
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
              <button
                onClick={async () => {
                  if (!confirm(`Apagar "${u.file_name}" e suas ${u.records_found} transações?`)) return;
                  try {
                    const res = await doDeleteUpload({ data: { id: u.id, deleteTransactions: true } });
                    toast.success(`Arquivo removido (${res.deletedTransactions} transações apagadas)`);
                    qc.invalidateQueries({ queryKey: ["uploads"] });
                    qc.invalidateQueries({ queryKey: ["transactions"] });
                    qc.invalidateQueries({ queryKey: ["dashboard"] });
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Erro ao apagar");
                  }
                }}
                className="rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                title="Apagar arquivo e transações"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}
          {(!uploads || uploads.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-8">Nenhum arquivo importado ainda.</p>
          )}
        </div>
      </section>

      {newCatOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/65 p-4 backdrop-blur-sm" onClick={() => setNewCatOpen(false)}>
          <div className="surface-card w-full max-w-sm p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
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
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
            >Criar categoria</button>
          </div>
        </div>
      )}
    </div>
  );
}
