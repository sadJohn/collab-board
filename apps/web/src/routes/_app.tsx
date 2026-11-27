import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { CommandPalette } from "../components/command-palette";
import { AppHeader } from "../components/layout/app-header";
import { useGlobalShortcuts } from "../hooks/use-global-shortcuts";
import { requireSession } from "../lib/route-guards";
import { useUiStore } from "../stores/ui-store";

export const Route = createFileRoute("/_app")({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  component: AppLayout,
});

function AppLayout() {
  const { t } = useTranslation();
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);

  useGlobalShortcuts();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <AppHeader />

      <div className="mx-auto flex w-full max-w-6xl gap-8 px-6 py-8">
        <aside className={sidebarCollapsed ? "hidden" : "hidden w-44 shrink-0 md:block"}>
          <nav className="flex flex-col gap-1 text-sm">
            <Link
              className="rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              activeProps={{
                className: "rounded-md bg-accent px-3 py-2 font-medium text-foreground",
              }}
              to="/home"
            >
              {t("nav.home")}
            </Link>
            <Link
              className="rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              activeProps={{
                className: "rounded-md bg-accent px-3 py-2 font-medium text-foreground",
              }}
              to="/projects"
            >
              {t("nav.projects")}
            </Link>
            <Link
              className="rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground"
              activeProps={{
                className: "rounded-md bg-accent px-3 py-2 font-medium text-foreground",
              }}
              to="/workspace"
            >
              {t("nav.workspace")}
            </Link>
          </nav>
        </aside>

        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      <CommandPalette />
    </div>
  );
}
