import { Button } from "@repo/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { authClient } from "@/lib/auth-client";
import { queryKeys } from "@/lib/query-keys";

interface PendingInvitationsProps {
  organizationId: string | undefined;
}

/**
 * Lists the invitations an organization has sent but nobody has accepted yet.
 * The link is copied as `${window.location.origin}/accept-invitation/{id}`,
 * matching the public landing page.
 */
export function PendingInvitations({ organizationId }: PendingInvitationsProps) {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const organizationIdValue = organizationId ?? "";
  const queryKey = queryKeys.invitations.list(organizationIdValue);

  const invitationsQuery = useQuery({
    queryKey,
    queryFn: async () => {
      const { data, error } = await authClient.organization.listInvitations({
        query: { organizationId: organizationIdValue },
      });

      if (error) {
        throw new Error(error.message || t("workspace.invitations.loadFailed"));
      }

      return (data ?? []).filter((invitation) => invitation.status === "pending");
    },
    enabled: Boolean(organizationId),
    retry: false,
  });

  if (!organizationId) {
    return null;
  }

  const invitations = invitationsQuery.data ?? [];

  async function handleCopy(invitationId: string) {
    setActionError(null);
    const url = `${window.location.origin}/accept-invitation/${invitationId}`;

    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(invitationId);
      window.setTimeout(() => {
        setCopiedId((current) => (current === invitationId ? null : current));
      }, 2000);
    } catch {
      setActionError(t("workspace.invitations.copyFailed"));
    }
  }

  async function handleCancel(invitationId: string) {
    setActionError(null);

    const { error } = await authClient.organization.cancelInvitation({ invitationId });

    if (error) {
      setActionError(error.message || t("workspace.invitations.cancelFailed"));
      return;
    }

    await queryClient.invalidateQueries({ queryKey });
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <h2 className="font-medium text-sm">{t("workspace.invitations.title")}</h2>

      {invitationsQuery.isPending ? (
        <p className="text-muted-foreground text-sm">{t("workspace.invitations.loading")}</p>
      ) : null}

      {invitationsQuery.isError ? (
        <p className="text-destructive text-sm" role="alert">
          {t("workspace.invitations.loadFailed")}
        </p>
      ) : null}

      {!invitationsQuery.isPending && !invitationsQuery.isError && invitations.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t("workspace.invitations.empty")}</p>
      ) : null}

      {actionError ? (
        <p className="text-destructive text-sm" role="alert">
          {actionError}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {invitations.map((invitation) => {
          const expiresAt = new Intl.DateTimeFormat(i18n.language, {
            dateStyle: "medium",
          }).format(new Date(invitation.expiresAt));

          return (
            <li
              className="flex flex-wrap items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm"
              key={invitation.id}
            >
              <div className="flex min-w-0 flex-col">
                <span className="truncate font-medium">{invitation.email}</span>
                <span className="text-muted-foreground text-xs">
                  {t("workspace.invitations.meta", {
                    role: t(`invitation.roles.${invitation.role}`),
                    date: expiresAt,
                  })}
                </span>
              </div>

              <div className="flex shrink-0 gap-2">
                <Button
                  onClick={() => void handleCopy(invitation.id)}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  {copiedId === invitation.id
                    ? t("workspace.invitations.copied")
                    : t("workspace.invitations.copy")}
                </Button>
                <Button
                  onClick={() => void handleCancel(invitation.id)}
                  size="sm"
                  type="button"
                  variant="ghost"
                >
                  {t("workspace.invitations.cancel")}
                </Button>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
