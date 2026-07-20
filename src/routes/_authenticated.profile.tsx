import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { getProfile, updateProfile, getAvatarSignedUrl } from "@/lib/profile.functions";
import { getWhatsAppStatus, createPairingCode, unlinkWhatsApp } from "@/lib/whatsapp.functions";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Check, Loader2, Palette, Plus, X, Upload, User, MessageCircle, Copy } from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  component: ProfilePage,
  head: () => ({ meta: [{ title: "Perfil — Finance AI" }] }),
});

const TONES = [
  { value: "neutral", label: "Neutro" },
  { value: "friendly", label: "Amigável" },
  { value: "direct", label: "Direto" },
  { value: "coach", label: "Coach" },
] as const;

const DASHBOARD_BACKGROUNDS = [
  { value: "purple", label: "Roxo neon", swatchGradient: "from-fuchsia-500 to-violet-500" },
  { value: "blue", label: "Azul oceano", swatchGradient: "from-sky-500 to-blue-700" },
  { value: "green", label: "Verde mint", swatchGradient: "from-emerald-400 to-teal-700" },
  { value: "sunset", label: "Pôr do sol", swatchGradient: "from-orange-400 to-rose-700" },
] as const;

type DashboardBackground = (typeof DASHBOARD_BACKGROUNDS)[number]["value"];
const DASHBOARD_BACKGROUND_STORAGE_KEY = "finance-ai-dashboard-background";

function applyDashboardBackground(value: DashboardBackground) {
  document.documentElement.dataset.dashboardBackground = value;
  localStorage.setItem(DASHBOARD_BACKGROUND_STORAGE_KEY, value);
}

function getStoredDashboardBackground(): DashboardBackground {
  if (typeof window === "undefined") return "purple";
  const stored = localStorage.getItem(DASHBOARD_BACKGROUND_STORAGE_KEY);
  return DASHBOARD_BACKGROUNDS.some((item) => item.value === stored)
    ? (stored as DashboardBackground)
    : "purple";
}

function ProfilePage() {
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getProfile);
  const save = useServerFn(updateProfile);
  const signAvatar = useServerFn(getAvatarSignedUrl);

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile"],
    queryFn: () => fetchProfile(),
  });

  const [form, setForm] = useState({
    display_name: "",
    ai_provider: "lovable" as "lovable" | "openai",
    ai_tone: "neutral" as (typeof TONES)[number]["value"],
    banks: [] as string[],
    monthly_budget: "" as string,
    alert_threshold: "" as string,
    notify_spending: true,
  });
  const [bankInput, setBankInput] = useState("");
  const [avatarPath, setAvatarPath] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dashboardBackground, setDashboardBackground] = useState<DashboardBackground>(
    getStoredDashboardBackground,
  );
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profile) return;
    setForm({
      display_name: profile.display_name ?? "",
      ai_provider: (profile.ai_provider as "lovable" | "openai") ?? "lovable",
      ai_tone: (profile.ai_tone as (typeof TONES)[number]["value"]) ?? "neutral",
      banks: profile.banks ?? [],
      monthly_budget: profile.monthly_budget != null ? String(profile.monthly_budget) : "",
      alert_threshold: profile.alert_threshold != null ? String(profile.alert_threshold) : "",
      notify_spending: profile.notify_spending ?? true,
    });
    setAvatarPath(profile.avatar_url ?? null);
  }, [profile]);

  useEffect(() => {
    applyDashboardBackground(dashboardBackground);
  }, [dashboardBackground]);

  useEffect(() => {
    let cancelled = false;
    if (!avatarPath) {
      setAvatarUrl(null);
      return;
    }
    signAvatar({ data: { path: avatarPath } })
      .then((r) => {
        if (!cancelled) setAvatarUrl(r.url);
      })
      .catch(() => {
        if (!cancelled) setAvatarUrl(null);
      });
    return () => {
      cancelled = true;
    };
  }, [avatarPath, signAvatar]);

  const mutation = useMutation({
    mutationFn: async () =>
      save({
        data: {
          display_name: form.display_name.trim() || null,
          ai_provider: form.ai_provider,
          ai_tone: form.ai_tone,
          banks: form.banks,
          monthly_budget: form.monthly_budget ? Number(form.monthly_budget) : null,
          alert_threshold: form.alert_threshold ? Number(form.alert_threshold) : null,
          notify_spending: form.notify_spending,
        },
      }),
    onSuccess: () => {
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function addBank() {
    const v = bankInput.trim();
    if (!v) return;
    if (form.banks.includes(v)) {
      setBankInput("");
      return;
    }
    setForm((f) => ({ ...f, banks: [...f.banks, v] }));
    setBankInput("");
  }
  function removeBank(b: string) {
    setForm((f) => ({ ...f, banks: f.banks.filter((x) => x !== b) }));
  }

  async function onPickAvatar(file: File) {
    setUploading(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      if (!uid) throw new Error("Sessão expirada");
      const ext = file.name.split(".").pop()?.toLowerCase() || "png";
      const path = `${uid}/avatar-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("avatars").upload(path, file, {
        upsert: true,
        contentType: file.type || undefined,
      });
      if (error) throw error;
      await save({ data: { avatar_url: path } });
      setAvatarPath(path);
      qc.invalidateQueries({ queryKey: ["profile"] });
      toast.success("Foto atualizada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha no upload");
    } finally {
      setUploading(false);
    }
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Carregando perfil…
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-3xl space-y-6">
      <header>
        <h1 className="text-2xl md:text-3xl font-semibold gradient-text">Perfil</h1>
        <p className="text-sm text-muted-foreground">Personalize sua conta, IA e bancos.</p>
      </header>

      {/* Avatar + nome */}
      <section className="surface-card p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="size-20 rounded-full bg-muted overflow-hidden grid place-items-center border border-border">
            {avatarUrl ? (
              <img src={avatarUrl} alt="Avatar" className="size-full object-cover" />
            ) : (
              <User className="size-8 text-muted-foreground" />
            )}
          </div>
          <div className="space-y-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickAvatar(f);
                e.target.value = "";
              }}
            />
            <Button
              variant="outline"
              size="sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {uploading ? "Enviando…" : "Trocar foto"}
            </Button>
            <p className="text-xs text-muted-foreground">PNG/JPG até alguns MB.</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="display_name">Nome de exibição</Label>
          <Input
            id="display_name"
            value={form.display_name}
            maxLength={80}
            onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
          />
        </div>
      </section>

      {/* Aparência */}
      <section className="surface-card p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="size-10 rounded-xl bg-primary/15 text-primary grid place-items-center border border-primary/20">
            <Palette className="size-5" />
          </div>
          <div>
            <h2 className="font-semibold">Aparência do dashboard</h2>
            <p className="text-xs text-muted-foreground">
              Escolha uma paleta mais marcante. A alteração muda fundo, cards e destaques na hora.
            </p>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {DASHBOARD_BACKGROUNDS.map((option) => {
            const selected = dashboardBackground === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setDashboardBackground(option.value)}
                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-sm transition ${
                  selected
                    ? "border-primary/50 bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground hover:bg-white/5"
                }`}
                aria-pressed={selected}
              >
                <span className="flex items-center gap-2">
                  <span
                    className={`size-5 rounded-full bg-gradient-to-br ${option.swatchGradient}`}
                  />
                  {option.label}
                </span>
                {selected && <Check className="size-4 text-primary" />}
              </button>
            );
          })}
        </div>
      </section>

      {/* IA */}
      <section className="surface-card p-5 space-y-4">
        <h2 className="font-semibold">Preferências de IA</h2>
        <div className="space-y-2">
          <Label>Provedor</Label>
          <div className="flex gap-2">
            {(["lovable", "openai"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setForm((f) => ({ ...f, ai_provider: p }))}
                className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                  form.ai_provider === p
                    ? "bg-primary/15 border-primary/40 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {p === "lovable" ? "Lovable AI" : "OpenAI"}
              </button>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            OpenAI usa sua OPENAI_API_KEY; em caso de falha, faz fallback para Lovable AI.
          </p>
        </div>
        <div className="space-y-2">
          <Label>Tom das análises</Label>
          <div className="flex flex-wrap gap-2">
            {TONES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setForm((f) => ({ ...f, ai_tone: t.value }))}
                className={`px-3 py-1.5 rounded-lg text-sm border transition ${
                  form.ai_tone === t.value
                    ? "bg-primary/15 border-primary/40 text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Bancos */}
      <section className="surface-card p-5 space-y-3">
        <h2 className="font-semibold">Bancos utilizados</h2>
        <div className="flex gap-2">
          <Input
            placeholder="Ex.: Nubank, Itaú…"
            value={bankInput}
            maxLength={60}
            onChange={(e) => setBankInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addBank();
              }
            }}
          />
          <Button type="button" variant="outline" onClick={addBank}>
            <Plus className="size-4" />
          </Button>
        </div>
        {form.banks.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {form.banks.map((b) => (
              <span
                key={b}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-muted border border-border"
              >
                {b}
                <button
                  onClick={() => removeBank(b)}
                  aria-label={`Remover ${b}`}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Nenhum banco cadastrado.</p>
        )}
      </section>

      {/* Notificações & metas */}
      <section className="surface-card p-5 space-y-4">
        <h2 className="font-semibold">Notificações & metas</h2>
        <div className="flex items-center justify-between gap-4">
          <div>
            <Label htmlFor="notify">Alertas de gastos</Label>
            <p className="text-xs text-muted-foreground">
              Receber avisos quando ultrapassar o limite.
            </p>
          </div>
          <Switch
            id="notify"
            checked={form.notify_spending}
            onCheckedChange={(v) => setForm((f) => ({ ...f, notify_spending: v }))}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="budget">Meta mensal (R$)</Label>
            <Input
              id="budget"
              type="number"
              min={0}
              step="0.01"
              value={form.monthly_budget}
              onChange={(e) => setForm((f) => ({ ...f, monthly_budget: e.target.value }))}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="alert">Limite de alerta (R$)</Label>
            <Input
              id="alert"
              type="number"
              min={0}
              step="0.01"
              value={form.alert_threshold}
              onChange={(e) => setForm((f) => ({ ...f, alert_threshold: e.target.value }))}
            />
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-2 pb-6">
        <Button onClick={() => mutation.mutate()} disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Salvar alterações
        </Button>
      </div>
    </div>
  );
}
