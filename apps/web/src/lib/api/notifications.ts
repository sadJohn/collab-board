import { type NotificationDto, notificationDtoSchema } from "@repo/shared";
import { z } from "zod";

import { api } from "@/lib/api-client";

/**
 * Wire shape of `GET /notifications`: the most recent rows plus the total
 * unread count (which can exceed the paged `items`).
 */
const notificationListResultSchema = z.object({
  items: z.array(notificationDtoSchema),
  unreadCount: z.number().int().nonnegative(),
});
export type NotificationListResult = z.infer<typeof notificationListResultSchema>;

/** Fetches the current user's most recent notifications and the unread total. */
export async function listNotifications(): Promise<NotificationListResult> {
  return notificationListResultSchema.parse(await api.get("notifications").json());
}

/** Marks a single notification as read. Idempotent and owner-scoped server-side. */
export async function markNotificationRead(id: string): Promise<NotificationDto> {
  return notificationDtoSchema.parse(await api.patch(`notifications/${id}/read`).json());
}

/** Marks every unread notification of the current user as read. */
export async function markAllNotificationsRead(): Promise<void> {
  await api.post("notifications/read-all");
}
