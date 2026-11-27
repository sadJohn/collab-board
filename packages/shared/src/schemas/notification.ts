import { z } from "zod";

/** Kinds of business notifications persisted in the `Notification` table. */
export const NOTIFICATION_TYPES = ["TASK_ASSIGNED", "COMMENT_ADDED"] as const;
export const notificationTypeSchema = z.enum(NOTIFICATION_TYPES);
export type NotificationType = z.infer<typeof notificationTypeSchema>;

const isoDateTimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "必须是合法的 ISO-8601 时间字符串");

/**
 * Structured context stored in `Notification.payload` (Prisma `Json`).
 *
 * `commentSnippet` is only populated for `COMMENT_ADDED`; every other field is
 * shared so the frontend can render a card and deep-link to the task drawer
 * without a follow-up query.
 */
export const notificationPayloadSchema = z.object({
  taskId: z.string().min(1, "taskId 不能为空"),
  taskTitle: z.string().min(1, "taskTitle 不能为空"),
  projectId: z.string().min(1, "projectId 不能为空"),
  organizationId: z.string().min(1, "organizationId 不能为空"),
  actorName: z.string().min(1, "actorName 不能为空"),
  commentSnippet: z.string().nullable().optional(),
});
export type NotificationPayload = z.infer<typeof notificationPayloadSchema>;

/** Wire read-model for a single notification (timestamps serialized to ISO). */
export const notificationDtoSchema = z.object({
  id: z.string().min(1),
  userId: z.string().min(1),
  type: notificationTypeSchema,
  payload: notificationPayloadSchema,
  readAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
});
export type NotificationDto = z.infer<typeof notificationDtoSchema>;
