import { Button, Popover, PopoverContent, PopoverTrigger } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { useNotifications } from "../../hooks/use-notifications";
import { authClient } from "../../lib/auth-client";
import type { AppNotification, WorkspaceInvitationNotification } from "../../lib/notifications";
import { queryKeys } from "../../lib/query-keys";

/**
 * Header inbox. Every notification type renders through its own branch, so new
 * business notifications can be added without touching the existing cards.
 */
export function NotificationCenter() {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const { notifications, unreadCount, isLoading, isError } = useNotifications();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function handleAccept(notification: WorkspaceInvitationNotification) {
    setActionError(null);
    setBusyId(notification.id);

    const { data, error } = await authClient.organization.acceptInvitation({
      invitationId: notification.invitation.id,
    });

    if (error) {
      setActionError(error.message || t("notifications.invitation.acceptFailed"));
      setBusyId(null);
      return;
    }

    const organizationId =
      data?.invitation.organizationId ?? notification.invitation.organizationId;
    await authClient.organization.setActive({ organizationId });
    queryClient.clear();
    await router.invalidate();
    await navigate({ to: "/home" });
  }

  async function handleReject(notification: WorkspaceInvitationNotification) {
    setActionError(null);
    setBusyId(notification.id);

    const { error } = await authClient.organization.rejectInvitation({
      invitationId: notification.invitation.id,
    });

    if (error) {
      setActionError(error.message || t("notifications.invitation.rejectFailed"));
      setBusyId(null);
      return;
    }

    await queryClient.invalidateQueries({ queryKey: queryKeys.invitations.received });
    setBusyId(null);
  }

  function renderNotification(notification: AppNotification) {
    switch (notification.type) {
      case "WORKSPACE_INVITATION":
        return (
          <li className="flex flex-col gap-2 rounded-md border p-3 text-sm" key={notification.id}>
            <div className="flex flex-col gap-0.5">
              <span className="font-medium">{notification.invitation.organizationName}</span>
              <span className="text-muted-foreground text-xs">
                {t("notifications.invitation.text", {
                  email: notification.invitation.email,
                })}
              </span>
            </div>

            <div className="flex gap-2">
              <Button
                disabled={busyId !== null}
                onClick={() => void handleAccept(notification)}
                size="sm"
                type="button"
              >
                {busyId === notification.id
                  ? t("notifications.invitation.accepting")
                  : t("notifications.invitation.accept")}
              </Button>
              <Button
                disabled={busyId !== null}
                onClick={() => void handleReject(notification)}
                size="sm"
                type="button"
                variant="outline"
              >
                {busyId === notification.id
                  ? t("notifications.invitation.rejecting")
                  : t("notifications.invitation.reject")}
              </Button>
            </div>
          </li>
        );
      default:
        return null;
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={t("notifications.title")}
          className="relative inline-flex size-9 items-center justify-center rounded-md outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/50"
          type="button"
        >
          <Bell className="size-4" />
          {unreadCount > 0 ? (
            <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-medium text-[10px] text-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex flex-col gap-0.5 border-b px-4 py-3">
          <p className="font-medium text-sm">{t("notifications.title")}</p>
          <p className="text-muted-foreground text-xs">
            {t("notifications.unread", { count: unreadCount })}
          </p>
        </div>

        <div className="max-h-80 overflow-y-auto p-2">
          {isLoading ? (
            <p className="p-2 text-muted-foreground text-sm">{t("notifications.loading")}</p>
          ) : null}

          {isError ? (
            <p className="p-2 text-destructive text-sm" role="alert">
              {t("notifications.loadFailed")}
            </p>
          ) : null}

          {!isLoading && !isError && notifications.length === 0 ? (
            <p className="p-2 text-muted-foreground text-sm">{t("notifications.empty")}</p>
          ) : null}

          {notifications.length > 0 ? (
            <ul className="flex flex-col gap-2">{notifications.map(renderNotification)}</ul>
          ) : null}
        </div>

        {actionError ? (
          <p className="border-t px-4 py-2 text-destructive text-xs" role="alert">
            {actionError}
          </p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
