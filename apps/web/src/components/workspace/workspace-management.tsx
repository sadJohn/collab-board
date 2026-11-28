import { DeleteOrganizationDialog } from "@/components/workspace/delete-organization-dialog";
import { EditOrganizationDialog } from "@/components/workspace/edit-organization-dialog";
import { useActiveOrganization, useSession } from "@/lib/auth-client";
import type { ActiveWorkspace } from "@/lib/use-active-workspace";
import { canDeleteWorkspace, canUpdateWorkspace } from "@/lib/workspace-permissions";

/**
 * Resolves the current member's role from the full active organization. The
 * full organization must belong to the active workspace — during a switch the
 * previous workspace's members stay hydrated briefly and must not grant
 * permissions for the new one.
 */
function useWorkspacePermissions(organization: ActiveWorkspace | null) {
  const session = useSession();
  const activeOrganization = useActiveOrganization();
  const currentUserId = session.data?.user.id;
  const hydratedOrganization =
    organization && activeOrganization.data?.id === organization.id
      ? activeOrganization.data
      : null;
  const resolved = Boolean(
    organization &&
      hydratedOrganization &&
      !session.isPending &&
      !activeOrganization.isPending &&
      !activeOrganization.error,
  );
  const currentMember = hydratedOrganization?.members.find(
    (member) => member.userId === currentUserId,
  );

  return {
    resolved,
    canUpdate: resolved && canUpdateWorkspace(currentMember?.role),
    canDelete: resolved && canDeleteWorkspace(currentMember?.role),
    refetch: activeOrganization.refetch,
  };
}

interface WorkspaceEditButtonProps {
  organization: ActiveWorkspace | null;
  onUpdated: () => Promise<void>;
}

export function WorkspaceEditButton({ organization, onUpdated }: WorkspaceEditButtonProps) {
  const { resolved, canUpdate } = useWorkspacePermissions(organization);

  if (!organization || !resolved || !canUpdate) {
    return null;
  }

  return (
    <EditOrganizationDialog
      key={organization.id}
      organization={organization}
      onUpdated={onUpdated}
    />
  );
}

interface WorkspaceDangerZoneProps {
  organization: ActiveWorkspace | null;
  onReconcile: (organizationId: string) => Promise<boolean>;
}

export function WorkspaceDangerZone({ organization, onReconcile }: WorkspaceDangerZoneProps) {
  const { resolved, canDelete, refetch } = useWorkspacePermissions(organization);

  if (!organization || !resolved || !canDelete) {
    return null;
  }

  async function handleReconcile(organizationId: string) {
    const [, deleted] = await Promise.all([refetch(), onReconcile(organizationId)]);
    return deleted;
  }

  return (
    <DeleteOrganizationDialog
      key={organization.id}
      organization={organization}
      onReconcile={handleReconcile}
    />
  );
}
