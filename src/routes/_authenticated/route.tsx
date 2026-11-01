import {
  createFileRoute,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { isDeadSessionError } from "@/integrations/supabase/session-recovery";
import { useMe } from "@/hooks/use-me";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { OfflineStatus } from "@/components/pwa/offline-status";
import { useMfa } from "@/hooks/use-mfa";
import { MfaChallenge } from "@/components/admin/mfa";
import { AppSidebar } from "@/components/layout/app-sidebar";
import { MobileTabBar, MobileTopBar } from "@/components/layout/mobile-nav";
import { CommandPalette } from "@/components/layout/command-palette";

export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async () => {
    const { data, error } = await supabase.auth.getUser();
    // supabase-js keeps a rejected session while its access token has not expired,
    // which leaves the app retrying a dead refresh token; drop it and sign in again.
    if (isDeadSessionError(error)) await supabase.auth.signOut({ scope: "local" });
    if (!data.user) throw redirect({ to: "/auth" });
  },
  component: Shell,
});

function Shell() {
  const { pathname } = useLocation();
  const { data: me } = useMe();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const mfa = useMfa(!!me);
  const [collapsed] = useSidebarCollapsed();

  async function signOut() {
    await qc.cancelQueries();
    qc.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (mfa.data?.needsChallenge) return <MfaChallenge onSignOut={signOut} />;
  if (me && !me.roles.length)
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md space-y-4 rounded-xl border bg-card p-8 text-center shadow-card">
          <Clock className="mx-auto h-10 w-10 text-primary" />
          <h1 className="text-xl font-semibold">Aguardando liberação</h1>
          <p className="text-sm text-muted-foreground">
            Seu cadastro foi recebido. Um administrador precisa liberar seu acesso aos dados da JMG.
          </p>
          <Button variant="outline" onClick={signOut}>
            Sair
          </Button>
        </div>
      </div>
    );
  if (pathname.endsWith("/pdf")) return <Outlet />;

  return (
    <div className="min-h-screen bg-background lg:flex">
      <AppSidebar onSignOut={signOut} />
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileTopBar onSignOut={signOut} />
        <main
          className={cn(
            "mx-auto w-full flex-1 px-4 pt-5 pb-28 md:px-8 md:pt-8 lg:pb-10",
            // Menu recolhido: o conteúdo ocupa a tela inteira no computador.
            collapsed ? "max-w-[1400px] lg:max-w-none" : "max-w-[1400px]",
          )}
        >
          <OfflineStatus />
          <Outlet />
        </main>
      </div>
      <MobileTabBar />
      <CommandPalette />
    </div>
  );
}
