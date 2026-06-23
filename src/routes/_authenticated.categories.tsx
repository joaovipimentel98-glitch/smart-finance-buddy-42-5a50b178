import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { listCategories, createCategory, updateCategory, deleteCategory } from "@/lib/categories.functions";
import { toast } from "sonner";
import * as Icons from "lucide-react";
import { Plus, Pencil, Trash2, X, Check, Tag } from "lucide-react";

export const Route = createFileRoute("/_authenticated/categories")({
  component: CategoriesPage,
  head: () => ({ meta: [{ title: "Categorias — Finance AI" }] }),
});

const PALETTE = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16",
  "#22c55e", "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#64748b", "#78716c", "#0f172a",
];

const ICON_CHOICES = [
  "Tag", "ShoppingCart", "ShoppingBag", "Utensils", "Coffee", "Pizza", "Beer",
  "Car", "Fuel", "Bus", "Plane", "Train", "Bike",
  "Home", "Lightbulb", "Droplet", "Wifi", "Phone", "Tv",
  "Heart", "Pill", "Dumbbell", "Stethoscope", "GraduationCap",
  "Briefcase", "Wallet", "CreditCard", "Landmark", "PiggyBank", "TrendingUp",
  "Film", "Music", "Gamepad2", "Gift", "Sparkles", "Palette",
  "Baby", "Dog", "Cat", "Shirt", "BookOpen", "Hammer",
];

function IconPreview({ name, color, size = 16 }: { name?: string | null; color?: string | null; size?: number }) {
  const iconName = name && (Icons as Record<string, unknown>)[name] ? name : "Tag";
  const Comp = (Icons as unknown as Record<string, React.ComponentType<{ size?: number; color?: string }>>)[iconName];
  return <Comp size={size} color={color || "currentColor"} />;
}

type Cat = { id: string; name: string; is_default: boolean; icon: string | null; color: string | null };

function CategoriesPage() {
  const qc = useQueryClient();
  const fetchCats = useServerFn(listCategories);
  const addCat = useServerFn(createCategory);
  const editCat = useServerFn(updateCategory);
  const removeCat = useServerFn(deleteCategory);

  const { data: cats } = useQuery({ queryKey: ["categories"], queryFn: () => fetchCats() });
  const sorted = useMemo(() => [...(cats ?? [])].sort((a, b) => a.name.localeCompare(b.name, "pt-BR")), [cats]);

  const [editing, setEditing] = useState<Cat | null>(null);
  const [creating, setCreating] = useState(false);

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["categories"] });
    qc.invalidateQueries({ queryKey: ["transactions"] });
    qc.invalidateQueries({ queryKey: ["dashboard"] });
  };

  const handleDelete = async (c: Cat) => {
    const reassign = prompt(
      `Excluir "${c.name}"?\nAs transações desta categoria serão reatribuídas para outra. Digite o nome da nova categoria (ou deixe em branco para "Outros"):`,
      "Outros"
    );
    if (reassign === null) return;
    try {
      await removeCat({ data: { id: c.id, reassignTo: reassign || "Outros" } });
      toast.success(`Categoria "${c.name}" excluída`);
      invalidateAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    }
  };

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-semibold">Categorias</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Organize seus gastos com cores e ícones. Mudanças aparecem na hora em Importar e Transações.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 flex items-center gap-2"
        >
          <Plus className="size-4" /> Nova categoria
        </button>
      </header>

      <div className="surface-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-left w-12">Ícone</th>
              <th className="px-4 py-3 text-left">Nome</th>
              <th className="px-4 py-3 text-left w-24">Tipo</th>
              <th className="px-4 py-3 text-right w-32">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {sorted.map((c) => (
              <tr key={c.id} className="hover:bg-white/[0.02]">
                <td className="px-4 py-3">
                  <div
                    className="size-9 rounded-lg grid place-items-center"
                    style={{ background: (c.color || "#64748b") + "22", color: c.color || "#94a3b8" }}
                  >
                    <IconPreview name={c.icon} color={c.color} size={18} />
                  </div>
                </td>
                <td className="px-4 py-3 font-medium">{c.name}</td>
                <td className="px-4 py-3">
                  <span className={`text-[10px] uppercase tracking-wider ${c.is_default ? "text-muted-foreground" : "text-primary"}`}>
                    {c.is_default ? "padrão" : "minha"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex gap-2">
                    <button onClick={() => setEditing(c)} className="p-1.5 text-muted-foreground hover:text-foreground" title="Editar">
                      <Pencil className="size-4" />
                    </button>
                    <button onClick={() => handleDelete(c)} className="p-1.5 text-muted-foreground hover:text-destructive" title="Excluir">
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 && (
              <tr><td colSpan={4} className="px-4 py-12 text-center text-muted-foreground">
                <Tag className="size-8 mx-auto mb-2 opacity-50" />
                Nenhuma categoria ainda.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {(editing || creating) && (
        <CategoryDialog
          initial={editing ?? undefined}
          onClose={() => { setEditing(null); setCreating(false); }}
          onSave={async (form) => {
            try {
              if (editing) {
                await editCat({ data: { id: editing.id, ...form } });
                toast.success("Categoria atualizada");
              } else {
                await addCat({ data: form });
                toast.success(`Categoria "${form.name}" criada`);
              }
              invalidateAll();
              setEditing(null);
              setCreating(false);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Erro ao salvar");
            }
          }}
        />
      )}
    </div>
  );
}

function CategoryDialog({
  initial, onClose, onSave,
}: {
  initial?: Cat;
  onClose: () => void;
  onSave: (form: { name: string; icon: string | null; color: string | null }) => void | Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [icon, setIcon] = useState<string | null>(initial?.icon ?? "Tag");
  const [color, setColor] = useState<string | null>(initial?.color ?? PALETTE[10]);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      await onSave({ name: name.trim(), icon, color });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 grid place-items-center z-50 p-4" onClick={onClose}>
      <div className="surface-card p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-medium text-lg">{initial ? "Editar categoria" : "Nova categoria"}</h3>
          <button onClick={onClose}><X className="size-4" /></button>
        </div>

        <div className="flex items-center gap-3 mb-5 p-3 rounded-lg bg-white/5">
          <div
            className="size-12 rounded-xl grid place-items-center shrink-0"
            style={{ background: (color || "#64748b") + "22", color: color || "#94a3b8" }}
          >
            <IconPreview name={icon} color={color} size={22} />
          </div>
          <div className="text-sm">
            <div className="font-medium">{name || "Pré-visualização"}</div>
            <div className="text-xs text-muted-foreground">{icon} · {color}</div>
          </div>
        </div>

        <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-2">Nome</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && submit()}
          placeholder="Ex: Pet, Hobby, Filhos…"
          className="w-full bg-transparent border border-border rounded-lg px-3 py-2 text-sm mb-5"
        />

        <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-2">Cor</label>
        <div className="grid grid-cols-10 gap-2 mb-5">
          {PALETTE.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`size-7 rounded-full border-2 transition ${color === c ? "border-foreground scale-110" : "border-transparent"}`}
              style={{ background: c }}
              aria-label={c}
            >
              {color === c && <Check className="size-3.5 text-white mx-auto" />}
            </button>
          ))}
        </div>

        <label className="block text-xs uppercase tracking-wider text-muted-foreground mb-2">Ícone</label>
        <div className="grid grid-cols-8 gap-2 mb-6 max-h-48 overflow-y-auto pr-1">
          {ICON_CHOICES.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setIcon(n)}
              className={`size-9 rounded-lg grid place-items-center border transition ${icon === n ? "border-primary bg-primary/10" : "border-border hover:bg-white/5"}`}
              title={n}
            >
              <IconPreview name={n} color={color} size={16} />
            </button>
          ))}
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg border border-border text-sm hover:bg-white/5">Cancelar</button>
          <button
            onClick={submit}
            disabled={saving || !name.trim()}
            className="px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </div>
    </div>
  );
}
