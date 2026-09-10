import { createFileRoute, Outlet, redirect, Link, useRouter } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import {
  LayoutDashboard,
  Upload,
  ListChecks,
  Sparkles,
  MessageSquare,
  LogOut,
  Wallet,
  Tag,
  Menu,
  UserCog,
  TrendingUp,
  CreditCard,
  Target,
  ChevronRight,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth", search: { next: location.pathname } });
    return { user: data.user };
  },
  component: AppShell,
});

const NAV = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/transactions", label: "Transações", icon: ListChecks },
  { to: "/investments", label: "Investimentos", icon: TrendingUp },
  { to: "/credit-card", label: "Fatura cartão", icon: CreditCard },
  { to: "/categories", label: "Categorias", icon: Tag },
  { to: "/planning", label: "Planejamento", icon: Target },
  { to: "/import", label: "Importar", icon: Upload },
  { to: "/insights", label: "Consultor IA", icon: Sparkles },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/profile", label: "Perfil", icon: UserCog },
] as const;

const NAV_SECTIONS = [
  { label: "PRINCIPAL", items: NAV.slice(0, 4) },
  { label: "ORGANIZAÇÃO", items: NAV.slice(4, 7) },
  { label: "INTELIGÊNCIA", items: NAV.slice(7) },
];

function NavList({ onNavigate, onSignOut }: { onNavigate?: () => void; onSignOut: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-7 pt-6">
        <div className="flex items-center gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-accent shadow-lg shadow-primary/15">
            <Wallet className="size-5 text-primary-foreground" />
          </div>
          <div className="min-w-0">
            <div className="gradient-text text-sm font-bold tracking-tight">Finance AI</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">
              Controle financeiro pessoal
            </div>
          </div>
        </div>
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {NAV_SECTIONS.map((section) => (
          <div key={section.label}>
            <div className="mb-2 px-3 text-[10px] font-semibold tracking-[0.16em] text-muted-foreground/55">
              {section.label}
            </div>
            <div className="space-y-1">
              {section.items.map(({ to, label, icon: Icon }) => (
                <Link
                  key={to}
                  to={to}
                  onClick={onNavigate}
                  className="nav-item group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-sidebar-foreground/68"
                  activeProps={{
                    className:
                      "nav-item group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-semibold bg-primary/12 text-foreground ring-1 ring-inset ring-primary/18 shadow-sm",
                  }}
                  activeOptions={{ exact: to === "/" }}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-white/[0.025] transition-colors group-hover:bg-white/[0.06] group-data-[status=active]:bg-primary/15">
                    <Icon className="size-[15px]" />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{label}</span>
                  <ChevronRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-40" />
                </Link>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border p-3">
        <button
          onClick={onSignOut}
          className="group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium text-muted-foreground transition hover:bg-white/[0.04] hover:text-foreground"
        >
          <span className="grid size-7 place-items-center rounded-lg bg-white/[0.025] group-hover:bg-white/[0.06]">
            <LogOut className="size-[15px]" />
          </span>
          Sair
        </button>
      </div>
    </div>
  );
}

const DASHBOARD_BACKGROUND_STORAGE_KEY = "finance-ai-dashboard-background";
const DASHBOARD_BACKGROUNDS = ["purple", "blue", "green", "sunset"] as const;

function AppShell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(DASHBOARD_BACKGROUND_STORAGE_KEY);
    document.documentElement.dataset.dashboardBackground = DASHBOARD_BACKGROUNDS.includes(
      stored as (typeof DASHBOARD_BACKGROUNDS)[number],
    )
      ? stored!
      : "purple";
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.navigate({ to: "/auth", search: { next: "/" } });
  };

  return (
    <div className="min-h-screen bg-transparent md:flex">
      <aside className="glass-sidebar sticky top-0 hidden h-screen w-[248px] shrink-0 border-r border-sidebar-border md:flex">
        <NavList onSignOut={handleSignOut} />
      </aside>

      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/70 bg-background/75 px-4 backdrop-blur-xl md:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                aria-label="Abrir menu"
                className="grid size-10 place-items-center rounded-xl border border-border/70 bg-card/60 text-muted-foreground transition hover:bg-card hover:text-foreground"
              >
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
              <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
              <NavList onNavigate={() => setOpen(false)} onSignOut={handleSignOut} />
            </SheetContent>
          </Sheet>
          <span className="gradient-text text-sm font-bold">Finance AI</span>
          <button
            onClick={handleSignOut}
            aria-label="Sair"
            className="grid size-10 place-items-center rounded-xl border border-border/70 bg-card/60 text-muted-foreground transition hover:bg-card hover:text-foreground"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
