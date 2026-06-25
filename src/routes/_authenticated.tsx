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
} from "lucide-react";
import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from "@/components/ui/sheet";

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
  { to: "/investments", label: "Investimentos", icon: TrendingUp },
  { to: "/credit-card", label: "Fatura cartão", icon: CreditCard },
  { to: "/categories", label: "Categorias", icon: Tag },
  { to: "/import", label: "Importar", icon: Upload },
  { to: "/insights", label: "Consultor IA", icon: Sparkles },
  { to: "/chat", label: "Chat", icon: MessageSquare },
  { to: "/profile", label: "Perfil", icon: UserCog },
] as const;

function NavList({ onNavigate, onSignOut }: { onNavigate?: () => void; onSignOut: () => void }) {
  return (
    <>
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
            onClick={onNavigate}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-sidebar-foreground/80 hover:bg-white/5 hover:text-foreground transition"
            activeProps={{
              className:
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm bg-primary/15 text-foreground border border-primary/20",
            }}
            activeOptions={{ exact: to === "/" }}
          >
            <Icon className="size-4" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        <button
          onClick={onSignOut}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-white/5 hover:text-foreground transition"
        >
          <LogOut className="size-4" /> Sair
        </button>
      </div>
    </>
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
    router.navigate({ to: "/auth" });
  };
  return (
    <div className="min-h-screen flex">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 flex-col border-r border-border bg-sidebar/80 backdrop-blur sticky top-0 h-screen">
        <NavList onSignOut={handleSignOut} />
      </aside>

      <main className="flex-1 min-w-0">
        {/* Mobile top bar with sidebar trigger */}
        <div className="md:hidden sticky top-0 z-30 flex items-center justify-between p-3 border-b border-border bg-background/80 backdrop-blur">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <button
                aria-label="Abrir menu"
                className="size-10 grid place-items-center rounded-lg hover:bg-white/5 active:bg-white/10"
              >
                <Menu className="size-5" />
              </button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-72 bg-sidebar border-sidebar-border">
              <SheetTitle className="sr-only">Menu</SheetTitle>
              <div className="flex flex-col h-full">
                <NavList onNavigate={() => setOpen(false)} onSignOut={handleSignOut} />
              </div>
            </SheetContent>
          </Sheet>
          <span className="font-semibold gradient-text">Finance AI</span>
          <button
            onClick={handleSignOut}
            aria-label="Sair"
            className="size-10 grid place-items-center rounded-lg text-muted-foreground hover:bg-white/5"
          >
            <LogOut className="size-4" />
          </button>
        </div>
        <Outlet />
      </main>
    </div>
  );
}
