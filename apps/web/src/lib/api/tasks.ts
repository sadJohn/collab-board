import {
  type CreateTaskInput,
  createTaskSchema,
  type MoveTaskData,
  moveTaskSchema,
  type SortOrder,
  type TaskDto,
  type TaskPageDto,
  type TaskPriority,
  type TaskSortField,
  type TaskStatus,
  taskDtoSchema,
  taskPageDtoSchema,
  type UpdateTaskData,
  updateTaskSchema,
} from "@repo/shared";

import { api } from "@/lib/api-client";
import { tracker } from "@/lib/tracker";

export interface TaskListParams {
  q?: string;
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  sortBy?: TaskSortField;
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
}

/**
 * Serializes filters the way Nest's query parser expects them: repeated
 * `statuses`/`priorities` keys produce arrays, while omitted filters fall back
 * to the server defaults defined in `taskQuerySchema`.
 */
function toSearchParams(params: TaskListParams): URLSearchParams {
  const searchParams = new URLSearchParams();

  if (params.q) {
    searchParams.set("q", params.q);
  }
  for (const status of params.statuses ?? []) {
    searchParams.append("statuses", status);
  }
  for (const priority of params.priorities ?? []) {
    searchParams.append("priorities", priority);
  }
  if (params.sortBy) {
    searchParams.set("sortBy", params.sortBy);
  }
  if (params.sortOrder) {
    searchParams.set("sortOrder", params.sortOrder);
  }
  if (params.page !== undefined) {
    searchParams.set("page", String(params.page));
  }
  if (params.pageSize !== undefined) {
    searchParams.set("pageSize", String(params.pageSize));
  }

  return searchParams;
}

export async function listTasks(
  projectId: string,
  params: TaskListParams = {},
): Promise<TaskPageDto> {
  const response = await api.get(`projects/${projectId}/tasks`, {
    searchParams: toSearchParams(params),
  });

  return taskPageDtoSchema.parse(await response.json());
}

export async function getTask(taskId: string): Promise<TaskDto> {
  return taskDtoSchema.parse(await api.get(`tasks/${taskId}`).json());
}

export async function createTask(data: CreateTaskInput): Promise<TaskDto> {
  const body = createTaskSchema.parse(data);
  const task = taskDtoSchema.parse(await api.post("tasks", { json: body }).json());
  tracker.track("TASK_CREATED", { projectId: body.projectId });
  return task;
}

export async function updateTask(taskId: string, data: UpdateTaskData): Promise<TaskDto> {
  const body = updateTaskSchema.parse(data);
  return taskDtoSchema.parse(await api.patch(`tasks/${taskId}`, { json: body }).json());
}

export async function moveTask(taskId: string, data: MoveTaskData): Promise<TaskDto> {
  const body = moveTaskSchema.parse(data);
  return taskDtoSchema.parse(await api.post(`tasks/${taskId}/move`, { json: body }).json());
}

export async function deleteTask(taskId: string): Promise<void> {
  await api.delete(`tasks/${taskId}`);
}
