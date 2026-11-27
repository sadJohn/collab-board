import { useQuery } from "@tanstack/react-query";

import { authClient, useSession } from "../lib/auth-client";
import { type AppNotification, toAppNotification } from "../lib/notifications";
import { queryKeys } from "../lib/query-keys";

export interface UseNotificationsResult {
  notifications: AppNotification[];
  unreadCount: number;
  isLoading: boolean;
  isError: boolean;
  refresh: () => Promise<void>;
}

/**
 * Aggregates every notification source into a single list for the header bell.
 *
 * Today the only source is pending workspace invitations; mapping happens in
 * `toAppNotification`, so adding another source means concatenating another
 * mapped array here rather than touching the UI.
 */
export function useNotifications(): UseNotificationsResult {
  const session = useSession();

  const query = useQuery({
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

  const notifications = query.data ?? [];

  return {
    notifications,
    unreadCount: notifications.length,
    isLoading: query.isPending,
    isError: query.isError,
    refresh: async () => {
      await query.refetch();
    },
  };
}
