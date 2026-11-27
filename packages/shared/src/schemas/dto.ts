import { z } from "zod";
import { taskPrioritySchema, taskStatusSchema } from "../enums.js";

/**
 * Read models shared between the API, Socket.IO payloads and the web client.
 *
 * Prisma returns `Date` objects, but everything crossing the wire is JSON,
 * therefore timestamps are typed and validated as ISO-8601 strings. The web app
 * parses every response at the API boundary with these schemas.
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
  completedAt: isoDateTimeSchema.nullable(),
  createdAt: isoDateTimeSchema,
  updatedAt: isoDateTimeSchema,
});
export type TaskDto = z.infer<typeof taskDtoSchema>;

export const taskPageDtoSchema = z.object({
  items: z.array(taskDtoSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1),
});
export type TaskPageDto = z.infer<typeof taskPageDtoSchema>;

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
