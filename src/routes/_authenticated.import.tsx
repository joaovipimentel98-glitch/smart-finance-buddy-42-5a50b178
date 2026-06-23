import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef, useState } from "react";
import { importFile, listUploads } from "@/lib/imports.functions";
import { Upload, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/import")({
  component: ImportPage,
  head: () => ({ meta: [{ title: "Importar — Finance AI" }] }),
});

function ImportPage() {
  const qc = useQueryClient();
  const fetchUploads = useServerFn(listUploads);
  const doImport = useServerFn(importFile);
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const { data: uploads } = useQuery({ queryKey: ["uploads"], queryFn: () => fetchUploads() });

  const handleFiles = async (files: FileList | File[]) => {
    setBusy(true);
    const list = Array.from(files);
    console.groupCollapsed(`[import] iniciando ${list.length} arquivo(s)`);
    try {
      for (const file of list) {
        const t0 = performance.now();
        console.log(`[import] → ${file.name} (${file.type || "?"}, ${(file.size / 1024).toFixed(1)} KB)`);
        try {
          const buf = await file.arrayBuffer();
          // Codificação base64 segura para arquivos grandes (evita estouro do stack de String.fromCharCode)
          const bytes = new Uint8Array(buf);
          let binary = "";
          const CHUNK = 0x8000;
          for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + CHUNK)));
          }
          const base64 = btoa(binary);
          console.log(`[import]   base64 pronto (${(base64.length / 1024).toFixed(1)} KB) — enviando ao servidor`);
          const res = await doImport({ data: { fileName: file.name, fileType: file.type || "application/octet-stream", base64 } });
          console.log(`[import]   ✓ ${file.name} reqId=${res.reqId} step=${res.step} imported=${res.imported} (${Math.round(performance.now() - t0)}ms)`);
          if (res.imported > 0) toast.success(`${file.name}: ${res.imported} transações importadas`);
          else toast.warning(`${file.name}: nenhuma transação encontrada`);
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          console.error(`[import]   ✗ ${file.name} falhou:`, err);
          toast.error(`${file.name}: ${msg}`, { duration: 8000 });
        }
      }
      qc.invalidateQueries({ queryKey: ["uploads"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
    } finally {
      console.groupEnd();
      setBusy(false);
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-6">
        <h1 className="text-3xl font-semibold">Central de Importação</h1>
        <p className="text-sm text-muted-foreground mt-1">Aceita OFX, CSV, XLSX, PDF e imagens (JPG/PNG). PDFs e imagens são processados por IA.</p>
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
          multiple
          accept=".ofx,.csv,.xlsx,.xls,.pdf,.jpg,.jpeg,.png,.webp,image/*"
          className="hidden"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />
        {busy ? (
          <Loader2 className="size-10 mx-auto text-primary animate-spin" />
        ) : (
          <Upload className="size-10 mx-auto text-primary" />
        )}
        <h3 className="mt-4 text-lg font-medium">{busy ? "Processando..." : "Arraste arquivos aqui"}</h3>
        <p className="text-sm text-muted-foreground mt-1">ou clique para selecionar</p>
        <p className="text-xs text-muted-foreground mt-4">OFX • CSV • XLSX • PDF • JPG • PNG</p>
      </div>

      <section className="mt-10">
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
    </div>
  );
}
