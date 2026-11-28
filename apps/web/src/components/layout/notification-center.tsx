import { Button, Popover, PopoverContent, PopoverTrigger } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/hooks/use-notifications";
import { authClient, useListOrganizations } from "@/lib/auth-client";
import type {
  AppNotification,
  BusinessNotification,
  WorkspaceInvitationNotification,
} from "@/lib/notifications";
import { queryKeys } from "@/lib/query-keys";
import { useActiveWorkspace } from "@/lib/use-active-workspace";
import { useSwitchWorkspace } from "@/lib/use-switch-workspace";

/**
 * Header inbox. Every notification type renders through its own branch, so new
 * business notifications can be added without touching the existing cards.
 */
export function NotificationCenter() {
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();
  const navigate = useNavigate();
  const activeOrganization = useActiveWorkspace();
  const { switchTo } = useSwitchWorkspace();
  const listOrganizations = useListOrganizations();
  const { notifications, unreadCount, businessUnread, isLoading, isError } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }),
    [i18n.language],
  );

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
    // The just-joined org may not be in the cached list yet; refresh it so
    // useActiveWorkspace can resolve its name instead of falling back to blank.
    await listOrganizations.refetch();
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

  /**
   * Clicking a business notification marks it read, switches workspace if the
   * task lives in another organization, then opens the task drawer on the
   * project board via the `?task=` deep link.
   */
  async function handleBusinessClick(notification: BusinessNotification) {
    setActionError(null);
    const { projectId, taskId, organizationId } = notification.payload;

    // Optimistic cache update; the request itself must not block navigation.
    markRead.mutate(notification.id);

    const activeOrg = activeOrganization.data?.id;
    if (activeOrg && activeOrg !== organizationId) {
      // Optimistic switch for instant feedback; await the commit before
      // navigating so the board's API calls hit the right workspace.
      const { ok, error } = await switchTo(organizationId);
      if (!ok) {
        setActionError(error || t("notifications.business.switchFailed"));
        return;
      }
    }

    await navigate({
      to: "/projects/$projectId/board",
      params: { projectId },
      search: { task: taskId },
    });
  }

  async function handleMarkAllRead() {
    setActionError(null);
    try {
      await markAllRead.mutateAsync();
    } catch {
      setActionError(t("notifications.markAllReadFailed"));
    }
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

      case "BUSINESS": {
        const unread = !notification.read;
        return (
          <li key={notification.id}>
            <button
              className="flex w-full items-start gap-2 rounded-md border p-3 text-left transition-colors hover:bg-accent disabled:opacity-60"
              disabled={busyId !== null}
              onClick={() => void handleBusinessClick(notification)}
              type="button"
            >
              <span
                aria-hidden
                className={`mt-1.5 size-2 shrink-0 rounded-full ${
                  unread ? "bg-primary" : "bg-transparent"
                }`}
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-sm">
                  {notification.payload.taskTitle}
                </span>
                <span className="block text-muted-foreground text-xs">
                  {t(`notifications.business.${notification.notificationType}`, {
                    actor: notification.payload.actorName,
                  })}
                </span>
                {notification.payload.commentSnippet ? (
                  <span className="mt-0.5 block line-clamp-2 text-muted-foreground text-xs">
                    {notification.payload.commentSnippet}
                  </span>
                ) : null}
                <span className="mt-1 block text-muted-foreground text-[10px]">
                  {timeFormatter.format(new Date(notification.createdAt))}
                </span>
              </span>
            </button>
          </li>
        );
      }

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
            <span className="absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 font-medium text-[10px] text-destructive-foreground">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-start justify-between gap-2 border-b px-4 py-3">
          <div className="flex flex-col gap-0.5">
            <p className="font-medium text-sm">{t("notifications.title")}</p>
            <p className="text-muted-foreground text-xs">
              {t("notifications.unread", { count: unreadCount })}
            </p>
          </div>
          {businessUnread > 0 ? (
            <Button
              disabled={markAllRead.isPending}
              onClick={() => void handleMarkAllRead()}
              size="sm"
              type="button"
              variant="ghost"
            >
              {t("notifications.markAllRead")}
            </Button>
          ) : null}
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
