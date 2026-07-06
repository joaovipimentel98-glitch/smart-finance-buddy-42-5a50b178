import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Wallet, Loader2 } from "lucide-react";

// Local typed wrapper around the beta supabase.auth.oauth namespace.
type OAuthAuthorizationDetails = {
  client?: { name?: string; client_uri?: string } | null;
  redirect_url?: string | null;
  redirect_to?: string | null;
};
type OAuthNs = {
  getAuthorizationDetails: (id: string) => Promise<{ data: OAuthAuthorizationDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: OAuthAuthorizationDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: OAuthAuthorizationDetails | null; error: { message: string } | null }>;
};
function oauthNs(): OAuthNs {
  return (supabase.auth as unknown as { oauth: OAuthNs }).oauth;
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/auth", search: { next } });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauthNs().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="max-w-md surface-card p-8 text-center">
        <h1 className="text-lg font-semibold">Não foi possível carregar esta autorização</h1>
        <p className="mt-2 text-sm text-muted-foreground">{String((error as Error)?.message ?? error)}</p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const { data, error } = approve
      ? await oauthNs().approveAuthorization(authorization_id)
      : await oauthNs().denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("Nenhum redirect retornado pelo servidor de autorização."); return; }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "esse aplicativo";

  return (
    <main className="min-h-screen grid place-items-center px-4">
      <div className="w-full max-w-md surface-card p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="size-11 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center">
            <Wallet className="size-6 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-lg font-semibold gradient-text">Conectar {clientName}</h1>
            <p className="text-xs text-muted-foreground">Autorize o acesso à sua conta Finance AI</p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Isso permite que <strong className="text-foreground">{clientName}</strong> leia e gerencie seus dados
          financeiros nesse app, agindo em seu nome.
        </p>
        {error && <p role="alert" className="mt-4 text-sm text-destructive">{error}</p>}
        <div className="mt-6 flex gap-3">
          <Button className="flex-1" disabled={busy} onClick={() => decide(true)}>
            {busy && <Loader2 className="size-4 animate-spin mr-2" />}
            Autorizar
          </Button>
          <Button variant="outline" className="flex-1" disabled={busy} onClick={() => decide(false)}>
            Negar
          </Button>
        </div>
      </div>
    </main>
  );
}
