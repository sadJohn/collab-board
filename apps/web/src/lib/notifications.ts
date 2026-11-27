/** The invitation shape returned by `organization.listUserInvitations()`. */
export interface ReceivedInvitation {
  id: string;
  email: string;
  organizationId: string;
  organizationName: string;
  status: string;
  expiresAt: string | Date;
  createdAt: string | Date;
}

export interface WorkspaceInvitationNotification {
  type: "WORKSPACE_INVITATION";
  id: string;
  createdAt: string;
  invitation: {
    id: string;
    email: string;
    organizationId: string;
    organizationName: string;
    expiresAt: string;
  };
}

/**
 * Discriminated union of every in-app notification. New business notifications
 * only need a new member here plus a branch in `<NotificationCenter />` — no
 * existing card changes.
 */
export type AppNotification = WorkspaceInvitationNotification;

function toIsoString(value: string | Date): string {
  return new Date(value).toISOString();
}

/** Maps a pending workspace invitation into the unified notification shape. */
export function toAppNotification(invitation: ReceivedInvitation): AppNotification | null {
  if (invitation.status !== "pending") {
    return null;
  }

  return {
    type: "WORKSPACE_INVITATION",
    id: `workspace-invitation:${invitation.id}`,
    createdAt: toIsoString(invitation.createdAt),
    invitation: {
      id: invitation.id,
      email: invitation.email,
      organizationId: invitation.organizationId,
      organizationName: invitation.organizationName,
      expiresAt: toIsoString(invitation.expiresAt),
    },
  };
}
