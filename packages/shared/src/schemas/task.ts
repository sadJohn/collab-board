import { z } from "zod";
import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT_ORDER,
  DEFAULT_TASK_SORT_FIELD,
  MAX_PAGE_SIZE,
  SEARCH_QUERY_MAX_LENGTH,
  TASK_DESCRIPTION_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  TASK_TITLE_MIN_LENGTH,
} from "../constants.js";
import { taskPrioritySchema, taskStatusSchema } from "../enums.js";

export const taskTitleSchema = z
  .string()
  .trim()
  .min(TASK_TITLE_MIN_LENGTH, `任务标题至少 ${TASK_TITLE_MIN_LENGTH} 个字符`)
  .max(TASK_TITLE_MAX_LENGTH, `任务标题最多 ${TASK_TITLE_MAX_LENGTH} 个字符`);

export const taskDescriptionSchema = z
  .string()
  .trim()
  .max(TASK_DESCRIPTION_MAX_LENGTH, `任务描述最多 ${TASK_DESCRIPTION_MAX_LENGTH} 个字符`);

export const createTaskSchema = z.object({
  title: taskTitleSchema,
  description: taskDescriptionSchema.nullish(),
  status: taskStatusSchema.default("BACKLOG"),
  priority: taskPrioritySchema.default("MEDIUM"),
  projectId: z.string().min(1, "projectId 不能为空"),
  assigneeId: z.string().min(1, "assigneeId 不能为空字符串").nullish(),
  dueDate: z.coerce.date().nullish(),
});
/** Raw input accepted by the API / forms (defaults are optional). */
export type CreateTaskInput = z.input<typeof createTaskSchema>;
/** Parsed payload with defaults applied. */
export type CreateTaskData = z.output<typeof createTaskSchema>;

export const updateTaskSchema = z
  .object({
    title: taskTitleSchema,
    description: taskDescriptionSchema.nullable(),
    status: taskStatusSchema,
    priority: taskPrioritySchema,
    assigneeId: z.string().min(1).nullable(),
    dueDate: z.coerce.date().nullable(),
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, "至少需要提供一个待更新字段");
export type UpdateTaskData = z.output<typeof updateTaskSchema>;

/**
 * Drag & drop payload: the server derives the new fractional position from the
 * tasks that will sit directly above (`previousTaskId`) and below (`nextTaskId`).
 */
export const moveTaskSchema = z
  .object({
    status: taskStatusSchema,
    previousTaskId: z.string().min(1).nullable().default(null),
    nextTaskId: z.string().min(1).nullable().default(null),
  })
  .refine(
    (value) =>
      !(value.previousTaskId && value.nextTaskId && value.previousTaskId === value.nextTaskId),
    "previousTaskId 与 nextTaskId 不能相同",
  );
export type MoveTaskData = z.output<typeof moveTaskSchema>;

export const TASK_SORT_FIELDS = [
  "position",
  "title",
  "priority",
  "dueDate",
  "createdAt",
  "updatedAt",
] as const;
export const taskSortFieldSchema = z.enum(TASK_SORT_FIELDS);
export type TaskSortField = z.infer<typeof taskSortFieldSchema>;

export const sortOrderSchema = z.enum(["asc", "desc"]);
export type SortOrder = z.infer<typeof sortOrderSchema>;

export const taskQuerySchema = z.object({
  q: z.string().trim().max(SEARCH_QUERY_MAX_LENGTH).optional(),
  statuses: z.array(taskStatusSchema).optional(),
  priorities: z.array(taskPrioritySchema).optional(),
  sortBy: taskSortFieldSchema.default(DEFAULT_TASK_SORT_FIELD),
  sortOrder: sortOrderSchema.default(DEFAULT_SORT_ORDER),
  page: z.coerce.number().int().min(1).default(DEFAULT_PAGE),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
});
export type TaskQuery = z.output<typeof taskQuerySchema>;
