import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationListResult,
} from "../lib/api/notifications";
import { authClient, useSession } from "../lib/auth-client";
import {
  type AppNotification,
  toAppNotification,
  toBusinessNotification,
} from "../lib/notifications";
import { queryKeys } from "../lib/query-keys";

export interface UseNotificationsResult {
  notifications: AppNotification[];
  /** Business unread + pending invitations. Drives the header badge. */
  unreadCount: number;
  /** Persisted notifications only (excludes invitations). */
  businessUnread: number;
  isLoading: boolean;
  isError: boolean;
  refresh: () => Promise<void>;
}

/**
 * Aggregates every notification source into a single list for the header bell.
 *
 * Two sources are merged here:
 *   - persisted business notifications (`GET /notifications`), kept fresh by
 *     the `notification:received` socket push in `useNotificationRealtime`;
 *   - pending workspace invitations (BetterAuth, polled every 30s).
 *
 * Mapping happens in `toBusinessNotification` / `toAppNotification`, so adding
 * another source means concatenating another mapped array rather than touching
 * the UI.
 */
export function useNotifications(): UseNotificationsResult {
  const session = useSession();

  const businessQuery = useQuery({
    queryKey: queryKeys.notifications.list,
    queryFn: listNotifications,
    enabled: Boolean(session.data),
    retry: false,
    refetchOnWindowFocus: true,
  });

  const invitationQuery = useQuery({
    queryKey: queryKeys.invitations.received,
    queryFn: async () => {
      const { data, error } = await authClient.organization.listUserInvitations();

      if (error) {
        throw new Error(error.message || "Failed to load notifications");
      }

      return (data ?? []).flatMap((invitation) => {
        const notification = toAppNotification(invitation);
        return notification ? [notification] : [];
      });
    },
    enabled: Boolean(session.data),
    retry: false,
    // BetterAuth has no push channel for invitations, so poll while mounted.
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
  });

  const businessItems = (businessQuery.data?.items ?? []).map(toBusinessNotification);
  const invitationItems = invitationQuery.data ?? [];

  const notifications = [...businessItems, ...invitationItems].sort((a, b) => {
    if (a.createdAt < b.createdAt) return 1;
    if (a.createdAt > b.createdAt) return -1;
    return 0;
  });

  const businessUnread = businessQuery.data?.unreadCount ?? 0;
  const unreadCount = businessUnread + invitationItems.length;

  return {
    notifications,
    unreadCount,
    businessUnread,
    isLoading: businessQuery.isPending || invitationQuery.isPending,
    isError: businessQuery.isError || invitationQuery.isError,
    refresh: async () => {
      await Promise.all([businessQuery.refetch(), invitationQuery.refetch()]);
    },
  };
}

/** Marks one business notification read, mirroring the result into the cache. */
export function useMarkNotificationRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onSuccess: (updated) => {
      queryClient.setQueryData<NotificationListResult | undefined>(
        queryKeys.notifications.list,
        (old) => {
          if (!old) return old;

          let decremented = false;
          const items = old.items.map((item) => {
            if (item.id === updated.id && item.readAt === null) {
              decremented = true;
              return updated;
            }
            return item;
          });

          return {
            items,
            unreadCount: decremented ? Math.max(0, old.unreadCount - 1) : old.unreadCount,
          };
        },
      );
    },
  });
}

/** Marks every persisted notification read, updating the cache in place. */
export function useMarkAllNotificationsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      queryClient.setQueryData<NotificationListResult | undefined>(
        queryKeys.notifications.list,
        (old) =>
          old
            ? {
                items: old.items.map((item) =>
                  item.readAt === null ? { ...item, readAt: new Date().toISOString() } : item,
                ),
                unreadCount: 0,
              }
            : old,
      );
    },
  });
}
