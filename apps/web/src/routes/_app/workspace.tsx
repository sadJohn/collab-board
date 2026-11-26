import { Button } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { CreateOrganizationForm } from "../../components/workspace/create-organization-form";
import { InviteMemberForm } from "../../components/workspace/invite-member-form";
import { authClient, useActiveOrganization, useListOrganizations } from "../../lib/auth-client";

export const Route = createFileRoute("/_app/workspace")({
  component: WorkspacePage,
});

function WorkspacePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const organizations = useListOrganizations();
  const activeOrganization = useActiveOrganization();

  const activeOrganizationId = activeOrganization.data?.id;
  const items = organizations.data ?? [];

  async function refreshSession() {
    await authClient.getSession();
    // Everything cached is scoped per organization.
    queryClient.clear();
    await router.invalidate();
  }

  async function activate(organizationId: string) {
    await authClient.organization.setActive({ organizationId });
    await refreshSession();
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">{t("workspace.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("workspace.subtitle")}</p>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <h2 className="font-medium text-sm">{t("workspace.list")}</h2>

        {organizations.isPending ? (
          <p className="text-muted-foreground text-sm">{t("workspace.loading")}</p>
        ) : null}

        {!organizations.isPending && items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("workspace.empty")}</p>
        ) : null}

        <ul className="flex flex-col gap-2">
          {items.map((organization) => (
            <li
              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              key={organization.id}
            >
              <span className="min-w-0 truncate">
                {organization.name}
                <span className="ml-2 font-mono text-muted-foreground text-xs">
                  {organization.slug}
                </span>
              </span>

              {organization.id === activeOrganizationId ? (
                <span className="shrink-0 text-primary text-xs">{t("workspace.active")}</span>
              ) : (
                <Button onClick={() => void activate(organization.id)} size="sm" variant="outline">
                  {t("workspace.switch")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <CreateOrganizationForm onCreated={refreshSession} />
      <InviteMemberForm organizationId={activeOrganizationId} />
    </div>
  );
}
