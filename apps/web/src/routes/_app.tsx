import { createFileRoute, Outlet } from "@tanstack/react-router";
import { EmailVerificationBanner } from "../components/auth/email-verification-banner";
import { CommandPalette } from "../components/command-palette";
import { AppHeader } from "../components/layout/app-header";
import { MobileNav } from "../components/layout/mobile-nav";
import { NavLinks } from "../components/layout/nav-links";
import { WorkspaceGate } from "../components/workspace/workspace-gate";
import { useGlobalShortcuts } from "../hooks/use-global-shortcuts";
import { useNotificationRealtime } from "../hooks/use-notification-realtime";
import { usePageViewTracking } from "../hooks/use-page-view-tracking";
import { requireSession } from "../lib/route-guards";
import { useUiStore } from "../stores/ui-store";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  component: AppLayout,
});

function AppLayout() {
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);

  useGlobalShortcuts();
  useNotificationRealtime();
  usePageViewTracking();

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <AppHeader />

      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 gap-8 overflow-hidden px-6">
        <aside
          className={
            sidebarCollapsed ? "hidden" : "hidden w-44 shrink-0 overflow-y-auto py-8 md:block"
          }
        >
          <NavLinks />
        </aside>

        <main className="min-w-0 flex-1 overflow-y-auto py-8 overscroll-contain">
          <EmailVerificationBanner />
          {/* Pages key their queries on the optimistic workspace id, so a switch
              instantly shows the target workspace's cached data (cache-first);
              each page shows its own loading state only when nothing is cached. */}
          <WorkspaceGate>
            <Outlet />
          </WorkspaceGate>
        </main>
      </div>

      <CommandPalette />
      <MobileNav />
    </div>
  );
}
