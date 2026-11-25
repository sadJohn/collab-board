import { z } from "zod";
import { taskPrioritySchema, taskStatusSchema } from "../enums";

/**
 * Read models shared between the API, Socket.IO payloads and the web client.
 *
 * Prisma returns `Date` objects, but everything crossing the wire is JSON,
 * therefore timestamps are typed and validated as ISO-8601 strings.
 */
const isoDateTimeSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "必须是合法的 ISO-8601 时间字符串");

export const taskDtoSchema = z.object({
  id: z.string().min(1),
  title: z.string(),
  description: z.string().nullable(),
  status: taskStatusSchema,
  priority: taskPrioritySchema,
  position: z.number(),
  projectId: z.string().min(1),
  assigneeId: z.string().nullable(),
  creatorId: z.string().min(1),
  dueDate: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type TaskDto = z.infer<typeof taskDtoSchema>;

export const projectDtoSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  key: z.string(),
  description: z.string().nullable(),
  organizationId: z.string().min(1),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type ProjectDto = z.infer<typeof projectDtoSchema>;

export const commentDtoSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  taskId: z.string().min(1),
  authorId: z.string().min(1),
  createdAt: isoDateTimeSchema,
});
export type CommentDto = z.infer<typeof commentDtoSchema>;
