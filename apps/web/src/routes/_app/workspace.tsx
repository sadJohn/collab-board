import { Button } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { CreateOrganizationDialog } from "@/components/workspace/create-organization-dialog";
import { InviteMemberForm } from "@/components/workspace/invite-member-form";
import { PendingInvitations } from "@/components/workspace/pending-invitations";
import {
  WorkspaceDangerZone,
  WorkspaceEditButton,
} from "@/components/workspace/workspace-management";
import { authClient, useListOrganizations, useSession } from "@/lib/auth-client";
import { useActiveWorkspace } from "@/lib/use-active-workspace";
import { useSwitchWorkspace } from "@/lib/use-switch-workspace";
import { useUiStore } from "@/stores/ui-store";

export const Route = createFileRoute("/_app/workspace")({
  component: WorkspacePage,
});

function WorkspacePage() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const organizations = useListOrganizations();
  const session = useSession();
  const activeOrganization = useActiveWorkspace();
  const { switchTo } = useSwitchWorkspace();
  const setOptimisticActiveOrganizationId = useUiStore(
    (state) => state.setOptimisticActiveOrganizationId,
  );

  const activeOrganizationId = activeOrganization.data?.id;
  const items = organizations.data ?? [];

  async function refreshSession() {
    // Used after creating a workspace: better-auth refreshes the session
    // automatically, so no manual getSession is needed. Everything cached is
    // scoped per organization, so drop it all and let routes refetch.
    queryClient.clear();
    await router.invalidate();
  }

  async function refreshUpdatedOrganization() {
    await Promise.all([organizations.refetch(), router.invalidate()]);
  }

  async function reconcileDeletedOrganization(organizationId: string) {
    setOptimisticActiveOrganizationId(null);
    queryClient.clear();
    const [listResult] = await Promise.all([
      authClient.organization.list(),
      organizations.refetch(),
      session.refetch(),
      router.invalidate(),
    ]);

    if (listResult.error || !listResult.data) return false;
    return !listResult.data.some((organization) => organization.id === organizationId);
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">{t("workspace.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("workspace.subtitle")}</p>
      </header>

      <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-medium text-sm">{t("workspace.list")}</h2>
          <CreateOrganizationDialog onCreated={refreshSession} />
        </div>

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
                <div className="flex shrink-0 items-center gap-1">
                  <span className="text-primary text-xs">{t("workspace.active")}</span>
                  <WorkspaceEditButton
                    organization={activeOrganization.data}
                    onUpdated={refreshUpdatedOrganization}
                  />
                </div>
              ) : (
                <Button onClick={() => void switchTo(organization.id)} size="sm" variant="outline">
                  {t("workspace.switch")}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <InviteMemberForm organizationId={activeOrganizationId} />
      <PendingInvitations organizationId={activeOrganizationId} />
      <WorkspaceDangerZone
        organization={activeOrganization.data}
        onReconcile={reconcileDeletedOrganization}
      />
    </div>
  );
}
