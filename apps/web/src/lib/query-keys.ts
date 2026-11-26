import {
  DEFAULT_PAGE,
  DEFAULT_PAGE_SIZE,
  DEFAULT_SORT_ORDER,
  DEFAULT_TASK_SORT_FIELD,
  type SortOrder,
  type TaskPriority,
  type TaskSortField,
  type TaskStatus,
} from "@repo/shared";

/** Task filters that participate in the list cache key. */
export interface TaskListFilters {
  q?: string;
  statuses?: TaskStatus[];
  priorities?: TaskPriority[];
  sortBy?: TaskSortField;
  sortOrder?: SortOrder;
  page?: number;
  pageSize?: number;
}

/**
 * Members rarely change, so assignee pickers can keep them cached much longer
 * than regular server state.
 */
export const MEMBERS_STALE_TIME_MS = 5 * 60 * 1000;

/**
 * Collapses a filter object into a stable cache key: defaults are filled in and
 * multi-select arrays are sorted, so `["DONE", "TODO"]` and `["TODO", "DONE"]`
 * hit the same cache entry.
 */
export function normalizeTaskListFilters(filters: TaskListFilters = {}) {
  return {
    q: filters.q ?? "",
    statuses: [...(filters.statuses ?? [])].sort(),
    priorities: [...(filters.priorities ?? [])].sort(),
    sortBy: filters.sortBy ?? DEFAULT_TASK_SORT_FIELD,
    sortOrder: filters.sortOrder ?? DEFAULT_SORT_ORDER,
    page: filters.page ?? DEFAULT_PAGE,
    pageSize: filters.pageSize ?? DEFAULT_PAGE_SIZE,
  };
}

/**
 * Single source of truth for TanStack Query cache keys.
 *
 * Every key is scoped by organization so switching workspaces never leaks
 * data from another tenant's cache.
 */
export const queryKeys = {
  session: ["session"] as const,
  organizations: {
    all: ["organizations"] as const,
    active: ["organizations", "active"] as const,
  },
  projects: {
    all: (organizationId: string) => ["organizations", organizationId, "projects"] as const,
    detail: (organizationId: string, projectId: string) =>
      ["organizations", organizationId, "projects", projectId] as const,
  },
  tasks: {
    all: (organizationId: string, projectId: string) =>
      ["organizations", organizationId, "projects", projectId, "tasks"] as const,
    list: (organizationId: string, projectId: string, filters: TaskListFilters = {}) =>
      [
        "organizations",
        organizationId,
        "projects",
        projectId,
        "tasks",
        normalizeTaskListFilters(filters),
      ] as const,
    detail: (taskId: string) => ["tasks", taskId] as const,
    comments: (taskId: string) => ["tasks", taskId, "comments"] as const,
  },
  members: {
    list: (organizationId: string) => ["organizations", organizationId, "members"] as const,
  },
} as const;
