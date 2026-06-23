import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, Upload, ListChecks, Sparkles, MessageSquare, LogOut, Wallet } from "lucide-react";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  component: AppShell,
});

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transações", icon: ListChecks },
  { to: "/import", label: "Importar", icon: Upload },
  { to: "/insights", label: "Consultor IA", icon: Sparkles },
  { to: "/chat", label: "Chat", icon: MessageSquare },
] as const;

function AppShell() {
  const router = useRouter();
  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth" });
  };
  return (
    <div className="min-h-screen flex">
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar/80 backdrop-blur sticky top-0 h-screen">
        <div className="p-6 flex items-center gap-2">
          <div className="size-9 rounded-xl bg-gradient-to-br from-primary to-accent grid place-items-center">
            <Wallet className="size-5 text-primary-foreground" />
          </div>
          <div>
            <div className="font-semibold text-sm gradient-text">Finance AI</div>
            <div className="text-[11px] text-muted-foreground">Dashboard pessoal</div>
          </div>
        </div>
        <nav className="px-3 space-y-1 flex-1">
          {NAV.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/80 hover:bg-white/5 hover:text-foreground transition"
              activeProps={{ className: "flex items-center gap-3 px-3 py-2 rounded-lg text-sm bg-primary/15 text-foreground border border-primary/20" }}
              activeOptions={{ exact: to === "/" }}
            >
              <Icon className="size-4" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-sidebar-border">
          <button onClick={handleSignOut} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition">
            <LogOut className="size-4" /> Sair
          </button>
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="md:hidden flex items-center justify-between p-4 border-b border-border">
          <span className="font-semibold gradient-text">Finance AI</span>
          <button onClick={handleSignOut} className="text-xs text-muted-foreground">Sair</button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
