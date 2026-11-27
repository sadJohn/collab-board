import { type NotificationDto, SOCKET_EVENTS } from "@repo/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { NotificationListResult } from "../lib/api/notifications";
import { useSession } from "../lib/auth-client";
import { queryKeys } from "../lib/query-keys";
import { socket } from "../lib/socket";

/** How many recent rows the inbox list keeps (mirrors the server cap). */
const MAX_CACHED_NOTIFICATIONS = 30;

/**
 * Keeps the header bell in sync with the server without polling.
 *
 * Mounted once in the authenticated app layout, it:
 *   1. connects the shared socket (idempotent — project pages rely on the same
 *      connection for their room broadcasts), and
 *   2. prepends every `notification:received` push to the query cache and bumps
 *      the unread count, so the badge updates instantly on any page.
 *
 * The handshake auth only needs the session cookie, so this works outside a
 * project page too. Reconciliation with the authoritative list happens on the
 * next `refetchOnWindowFocus` / explicit refresh.
 */
export function useNotificationRealtime(): void {
  const queryClient = useQueryClient();
  const session = useSession();

  useEffect(() => {
    if (!session.data) {
      return;
    }

    const handleNotification = (dto: NotificationDto) => {
      queryClient.setQueryData<NotificationListResult | undefined>(
        queryKeys.notifications.list,
        (old) => {
          if (!old) {
            // No cache yet (bell never opened): seed it so the badge reflects
            // the push; the next fetch reconciles with the server truth.
            return { items: [dto], unreadCount: 1 };
          }

          if (old.items.some((item) => item.id === dto.id)) {
            return old;
          }

          return {
            items: [dto, ...old.items].slice(0, MAX_CACHED_NOTIFICATIONS),
            unreadCount: old.unreadCount + 1,
          };
        },
      );
    };

    socket.on(SOCKET_EVENTS.NOTIFICATION_RECEIVED, handleNotification);

    if (!socket.connected) {
      socket.connect();
    }

    return () => {
      socket.off(SOCKET_EVENTS.NOTIFICATION_RECEIVED, handleNotification);
    };
  }, [queryClient, session.data]);
}
