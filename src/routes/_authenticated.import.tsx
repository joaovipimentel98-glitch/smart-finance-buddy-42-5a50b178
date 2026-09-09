import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useRef, useState } from "react";
import { previewImport, commitImport, listUploads, updateUpload, deleteUpload, type PreviewTxn } from "@/lib/imports.functions";
import { listCategories, createCategory } from "@/lib/categories.functions";
import { getProfile } from "@/lib/profile.functions";
import {
  Upload, FileText, CheckCircle2, AlertCircle, Loader2, Trash2, Plus, X, Landmark,
  ArrowLeft, CreditCard, TrendingUp, Inbox, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
  head: () => ({
    meta: [
      { title: "Importar extratos — Finance AI" },
      { name: "description", content: "Importe extratos e faturas em OFX, CSV, XLSX, PDF ou imagem e revise cada transação antes de salvar." },
      { property: "og:title", content: "Importar extratos — Finance AI" },
      { property: "og:description", content: "Importe extratos e faturas e revise cada transação antes de salvar." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
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
  const [lastError, setLastError] = useState<string | null>(null);
  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState("");
  const [source, setSource] = useState<"import" | "credit_card">("import");
  const [isInvestment, setIsInvestment] = useState(false);
  const [bank, setBank] = useState<string>("");
  const [selectedUploads, setSelectedUploads] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const { data: uploads, isLoading: uploadsLoading } = useQuery({ queryKey: ["uploads"], queryFn: () => fetchUploads() });
  const { data: categories } = useQuery({ queryKey: ["categories"], queryFn: () => fetchCategories() });
  const { data: profile } = useQuery({ queryKey: ["profile"], queryFn: () => fetchProfile() });
  const banks: string[] = useMemo(() => (profile as { banks?: string[] } | undefined)?.banks ?? [], [profile]);
  const categoryNames = useMemo(() => (categories ?? []).map((c) => c.name), [categories]);

  const handleFiles = async (files: FileList | File[]) => {
    const file = Array.from(files)[0];
    if (!file) return;
    setBusy("previewing");
    setLastError(null);
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
        setLastError("Nenhuma transação foi reconhecida neste arquivo. Verifique se ele contém um extrato ou fatura.");
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
      const msg = e instanceof Error ? e.message : "Erro ao processar arquivo";
      setLastError(msg);
      toast.error(msg, { duration: 8000 });
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
      const msg = e instanceof Error ? e.message : "Erro ao salvar";
      setLastError(msg);
      toast.error(msg, { duration: 8000 });
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

  const newCategoryModal = newCatOpen && (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" onClick={() => setNewCatOpen(false)}>
      <div className="surface-card p-6 max-w-sm w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-medium">Nova categoria</h3>
          <button onClick={() => setNewCatOpen(false)} aria-label="Fechar"><X className="size-4" /></button>
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
  );

  // ============ Preview view ============
  if (preview) {
    const kept = preview.txns.filter((t) => t._keep).length;
    const totalDebit = preview.txns.filter((t) => t._keep && t.transaction_type === "debit").reduce((s, t) => s + t.amount, 0);
    const totalCredit = preview.txns.filter((t) => t._keep && t.transaction_type === "credit").reduce((s, t) => s + t.amount, 0);
    const uncategorized = preview.txns.filter((t) => t._keep && (!t.category || t.category === "Outros")).length;

    return (
      <div className="p-4 sm:p-6 md:p-10 max-w-7xl mx-auto pb-28 md:pb-10">
        <Stepper current={2} />

        <header className="mb-5 flex items-start justify-between gap-4 flex-wrap">
          <div className="min-w-0">
            <button
              onClick={() => setPreview(null)}
              disabled={busy !== "idle"}
              className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1 mb-2 disabled:opacity-50"
            >
              <ArrowLeft className="size-3.5" /> Voltar para o upload
            </button>
            <h1 className="text-2xl font-semibold">Revisar importação</h1>
            <p className="text-sm text-muted-foreground mt-1 truncate">
              {preview.fileName} · {kept} de {preview.txns.length} transações selecionadas
            </p>
          </div>
          <div className="hidden md:flex gap-2">
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

        {/* Resumo do lote */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <MiniStat label="Selecionadas" value={`${kept}`} />
          <MiniStat label="Entradas" value={fmtBRL(totalCredit)} tone="text-success" />
          <MiniStat label="Saídas" value={fmtBRL(totalDebit)} tone="text-destructive" />
          <MiniStat label="Líquido" value={fmtBRL(totalCredit - totalDebit)} tone={totalCredit - totalDebit >= 0 ? "text-success" : "text-destructive"} />
        </div>

        {uncategorized > 0 && (
          <div className="surface-card p-3 mb-4 flex items-start gap-2 text-xs border-l-2 border-warning">
            <AlertCircle className="size-4 text-warning shrink-0 mt-0.5" />
            <span>
              {uncategorized} transação(ões) ainda sem categoria específica. Ajuste abaixo para melhorar seus relatórios.
            </span>
          </div>
        )}

        {/* Configuração do lote */}
        <div className="surface-card p-4 mb-4 flex flex-wrap items-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Origem:</span>
            <div className="inline-flex rounded-lg border border-border overflow-hidden">
              <button
                type="button"
                onClick={() => setSource("import")}
                className={`px-3 py-1.5 text-xs inline-flex items-center gap-1.5 ${source === "import" ? "bg-primary text-primary-foreground" : "hover:bg-white/5"}`}
              ><Landmark className="size-3" /> Banco / extrato</button>
              <button
                type="button"
                onClick={() => setSource("credit_card")}
                className={`px-3 py-1.5 text-xs inline-flex items-center gap-1.5 ${source === "credit_card" ? "bg-primary text-primary-foreground" : "hover:bg-white/5"}`}
              ><CreditCard className="size-3" /> Fatura de cartão</button>
            </div>
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isInvestment}
              onChange={(e) => setIsInvestment(e.target.checked)}
              className="accent-primary"
            />
            <span className="text-xs inline-flex items-center gap-1">
              <TrendingUp className="size-3 text-primary" />
              Marcar tudo como <strong>Investimento</strong> (fica fora do gasto mensal)
            </span>
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

        {/* Tabela desktop */}
        <div className="surface-card overflow-hidden hidden md:block">
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
                  <tr key={t._id} className={`transition hover:bg-white/[0.03] ${t._keep ? "" : "opacity-40"}`}>
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

        {/* Cards mobile */}
        <div className="md:hidden space-y-2">
          {preview.txns.map((t) => (
            <div key={t._id} className={`surface-card p-3 ${t._keep ? "" : "opacity-40"}`}>
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={t._keep}
                  onChange={(e) => updateTxn(t._id, { _keep: e.target.checked })}
                  className="accent-primary mt-1"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-muted-foreground">{t.date}</div>
                  <div className="text-sm font-medium truncate">{t.description}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <select
                      value={t.transaction_type}
                      onChange={(e) => updateTxn(t._id, { transaction_type: e.target.value as "credit" | "debit" })}
                      className="bg-secondary/50 border border-border rounded px-2 py-1 text-xs"
                    >
                      <option value="debit">Saída</option>
                      <option value="credit">Entrada</option>
                    </select>
                    <select
                      value={t.category}
                      onChange={(e) => {
                        if (e.target.value === "__new__") { setNewCatOpen(true); return; }
                        updateTxn(t._id, { category: e.target.value });
                      }}
                      className="bg-secondary/50 border border-border rounded px-2 py-1 text-xs max-w-[150px]"
                    >
                      {!categoryNames.includes(t.category) && <option value={t.category}>{t.category}</option>}
                      {categoryNames.map((c) => <option key={c} value={c}>{c}</option>)}
                      <option value="__new__">+ Nova categoria…</option>
                    </select>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className={`text-sm font-semibold whitespace-nowrap ${t.transaction_type === "debit" ? "text-destructive" : "text-success"}`}>
                    {t.transaction_type === "debit" ? "−" : "+"}{fmtBRL(t.amount)}
                  </div>
                  <button
                    onClick={() => updateTxn(t._id, { _keep: false })}
                    className="text-muted-foreground hover:text-destructive mt-2"
                    aria-label="Remover"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Barra fixa de confirmação (mobile) */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-background/95 backdrop-blur p-3 flex gap-2">
          <button
            onClick={() => setPreview(null)}
            className="px-4 py-2.5 rounded-lg border border-border text-sm"
            disabled={busy !== "idle"}
          >Descartar</button>
          <button
            onClick={handleCommit}
            disabled={busy !== "idle" || kept === 0}
            className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
          >
            {busy === "committing" ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
            Salvar ({kept})
          </button>
        </div>

        {newCategoryModal}
      </div>
    );
  }

  // ============ Upload view ============
  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-5xl mx-auto">
      <Stepper current={1} />

      <header className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-semibold">Central de Importação</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Aceita OFX, CSV, XLSX, PDF e imagens. Você revisa tudo antes de salvar.
        </p>
      </header>

      {lastError && (
        <div className="surface-card p-3 mb-4 flex items-start gap-2 text-sm border-l-2 border-destructive">
          <AlertCircle className="size-4 text-destructive shrink-0 mt-0.5" />
          <div className="flex-1">
            <div className="font-medium text-destructive">Não foi possível ler o arquivo</div>
            <p className="text-xs text-muted-foreground mt-0.5 break-words">{lastError}</p>
          </div>
          <button onClick={() => setLastError(null)} aria-label="Fechar aviso" className="text-muted-foreground hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
        onClick={() => busy === "idle" && inputRef.current?.click()}
        className={`surface-card cursor-pointer p-10 sm:p-12 text-center transition border-dashed ${dragOver ? "border-primary bg-primary/5 scale-[1.01]" : ""} ${busy === "previewing" ? "pointer-events-none opacity-80" : ""}`}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".ofx,.csv,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp,image/*"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        <div className="size-16 mx-auto rounded-2xl bg-primary/10 grid place-items-center">
          {busy === "previewing" ? (
            <Loader2 className="size-8 text-primary animate-spin" />
          ) : (
            <Upload className="size-8 text-primary" />
          )}
        </div>
        <h3 className="mt-4 text-lg font-medium">
          {busy === "previewing" ? "Analisando arquivo..." : "Arraste um arquivo aqui"}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          {busy === "previewing" ? "Extraindo e categorizando as transações" : "ou clique para selecionar"}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-1.5">
          {["OFX", "CSV", "XLSX", "PDF", "JPG", "PNG"].map((f) => (
            <span key={f} className="px-2 py-0.5 rounded-md bg-white/5 border border-border text-[10px] text-muted-foreground">{f}</span>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-4 inline-flex items-center gap-1">
          <ShieldCheck className="size-3" /> Nada é salvo antes da sua confirmação
        </p>
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
          {(categories ?? []).length === 0 && (
            <span className="text-xs text-muted-foreground">Nenhuma categoria ainda — crie a primeira.</span>
          )}
        </div>

        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wider">Histórico de uploads</h2>
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
          {uploadsLoading && (
            <>
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="surface-card p-4 animate-pulse">
                  <div className="h-3 w-40 bg-white/10 rounded mb-2" />
                  <div className="h-3 w-24 bg-white/10 rounded" />
                </div>
              ))}
            </>
          )}

          {!uploadsLoading && (uploads ?? []).map((u) => (
            <div key={u.id} className={`surface-card p-4 flex items-center gap-4 flex-wrap ${selectedUploads.has(u.id) ? "ring-1 ring-primary/40" : ""}`}>
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
              <FileText className="size-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-[200px]">
                <div className="font-medium truncate">{u.file_name}</div>
                <div className="text-xs text-muted-foreground">
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
                  className="bg-transparent border border-border rounded px-2 py-1 text-xs w-40"
                />
                <datalist id="bank-suggestions">
                  {banks.map((b) => <option key={b} value={b} />)}
                </datalist>
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
                className="text-muted-foreground hover:text-destructive p-2 rounded-lg hover:bg-destructive/10"
                title="Apagar arquivo e transações"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
          ))}

          {!uploadsLoading && (!uploads || uploads.length === 0) && (
            <div className="surface-card p-10 text-center">
              <Inbox className="size-9 mx-auto text-muted-foreground/60" />
              <h3 className="mt-3 font-medium text-sm">Nenhum arquivo importado ainda</h3>
              <p className="text-xs text-muted-foreground mt-1">Envie seu primeiro extrato acima para começar.</p>
            </div>
          )}
        </div>
      </section>

      {newCategoryModal}
    </div>
  );
}

function MiniStat({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="surface-card p-3">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className={`text-base font-semibold mt-1 ${tone}`}>{value}</div>
    </div>
  );
}

function Stepper({ current }: { current: 1 | 2 | 3 }) {
  const steps = ["Enviar arquivo", "Revisar dados", "Salvar"];
  return (
    <ol className="flex items-center gap-2 sm:gap-3 mb-6 text-xs overflow-x-auto">
      {steps.map((s, i) => {
        const n = i + 1;
        const active = n === current;
        const done = n < current;
        return (
          <li key={s} className="flex items-center gap-2 shrink-0">
            <span
              className={`size-5 rounded-full grid place-items-center text-[10px] font-medium ${
                done ? "bg-success/20 text-success" : active ? "bg-primary text-primary-foreground" : "bg-white/5 text-muted-foreground"
              }`}
            >
              {done ? "✓" : n}
            </span>
            <span className={active ? "text-foreground font-medium" : "text-muted-foreground"}>{s}</span>
            {n < steps.length && <span className="w-6 h-px bg-border" />}
          </li>
        );
      })}
    </ol>
  );
}
