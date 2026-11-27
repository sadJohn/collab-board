import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { LayoutDashboard, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  authClient,
  useActiveOrganization,
  useListOrganizations,
  useSession,
} from "../../lib/auth-client";
import { useUiStore } from "../../stores/ui-store";
import { LanguageSwitcher } from "../language-switcher";
import { ThemeToggle } from "../theme-toggle";
import { UserAvatar } from "../user-avatar";
import { NotificationCenter } from "./notification-center";

export function AppHeader() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const session = useSession();
  const organizations = useListOrganizations();
  const activeOrganization = useActiveOrganization();
  const sidebarCollapsed = useUiStore((state) => state.sidebarCollapsed);
  const toggleSidebar = useUiStore((state) => state.toggleSidebar);

  const activeOrganizationId = activeOrganization.data?.id ?? "";
  const items = organizations.data ?? [];
  const user = session.data?.user;

  async function handleOrganizationChange(organizationId: string) {
    if (!organizationId || organizationId === activeOrganizationId) {
      return;
    }

    await authClient.organization.setActive({ organizationId });
    await authClient.getSession();
    // Cached lists are scoped per organization, so drop everything.
    queryClient.clear();
    await router.invalidate();
  }

  async function handleSignOut() {
    await authClient.signOut();
    queryClient.clear();
    // The layout guard now sees no session and redirects to /login.
    await router.invalidate();
  }

  return (
    <header className="border-b">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between gap-4 px-6">
        <div className="flex min-w-0 items-center gap-4">
          <Button
            aria-label={t("nav.toggleSidebar")}
            aria-pressed={sidebarCollapsed}
            className="hidden md:inline-flex"
            onClick={toggleSidebar}
            size="icon"
            type="button"
            variant="ghost"
          >
            {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>

          <Link className="flex items-center gap-2 font-semibold text-sm" to="/home">
            <LayoutDashboard className="size-4" />
            {t("app.name")}
          </Link>

          <select
            aria-label={t("workspace.switcher")}
            className="h-8 max-w-48 rounded-md border border-input bg-background px-2 text-xs shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
            disabled={items.length === 0}
            value={activeOrganizationId}
            onChange={(event) => void handleOrganizationChange(event.target.value)}
          >
            {activeOrganizationId ? null : <option value="">{t("workspace.none")}</option>}
            {items.map((organization) => (
              <option key={organization.id} value={organization.id}>
                {organization.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2">
          <NotificationCenter />
          <ThemeToggle />
          <LanguageSwitcher />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="flex items-center gap-2 rounded-md p-1 outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
                type="button"
              >
                {user ? <UserAvatar size="sm" user={user} /> : null}
                <span className="hidden max-w-32 truncate text-sm sm:inline">
                  {user?.name ?? user?.email}
                </span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel className="flex flex-col">
                <span className="truncate font-medium text-sm">{user?.name ?? user?.email}</span>
                <span className="truncate font-normal text-muted-foreground text-xs">
                  {user?.email}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild>
                <Link to="/settings/profile">{t("user.profileSettings")}</Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => void handleSignOut()}>
                {t("user.signOut")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
}
