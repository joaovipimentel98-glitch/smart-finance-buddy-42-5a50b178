import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  Link,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { supabase } from "@/integrations/supabase/client";
import { Toaster } from "@/components/ui/sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold gradient-text">404</h1>
        <p className="mt-4 text-muted-foreground">Página não encontrada.</p>
        <Link to="/" className="mt-6 inline-block text-primary hover:underline">Voltar ao dashboard</Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="max-w-md text-center surface-card p-8">
        <h1 className="text-xl font-semibold">Algo deu errado</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => { router.invalidate(); reset(); }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Finance AI Dashboard" },
      { name: "description", content: "Assistente financeiro pessoal com IA." },
      { property: "og:title", content: "Finance AI Dashboard" },
      { name: "twitter:title", content: "Finance AI Dashboard" },
      { property: "og:description", content: "Assistente financeiro pessoal com IA." },
      { name: "twitter:description", content: "Assistente financeiro pessoal com IA." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/19591608-b264-4197-8ef1-3816f9fd0c52/id-preview-17f8f407--0474da95-f223-485c-bb75-f0bc9f12b1a8.lovable.app-1782253337900.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/19591608-b264-4197-8ef1-3816f9fd0c52/id-preview-17f8f407--0474da95-f223-485c-bb75-f0bc9f12b1a8.lovable.app-1782253337900.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <head><HeadContent /></head>
      <body>{children}<Scripts /></body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        if (event !== "SIGNED_OUT") queryClient.invalidateQueries();
      }
    });
    return () => { sub.subscription.unsubscribe(); };
  }, [queryClient, router]);
  return (
    <QueryClientProvider client={queryClient}>
      <Outlet />
      <Toaster richColors theme="dark" />
    </QueryClientProvider>
  );
}
