import { Button } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useRouter } from "@tanstack/react-router";
import { LayoutDashboard } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  authClient,
  useActiveOrganization,
  useListOrganizations,
  useSession,
} from "../../lib/auth-client";
import { LanguageSwitcher } from "../language-switcher";

export function AppHeader() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const session = useSession();
  const organizations = useListOrganizations();
  const activeOrganization = useActiveOrganization();

  const activeOrganizationId = activeOrganization.data?.id ?? "";
  const items = organizations.data ?? [];

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

        <div className="flex items-center gap-4">
          <LanguageSwitcher />
          <span className="hidden text-muted-foreground text-xs sm:inline">
            {session.data?.user.email}
          </span>
          <Button onClick={() => void handleSignOut()} size="sm" variant="ghost">
            {t("user.signOut")}
          </Button>
        </div>
      </div>
    </header>
  );
}
