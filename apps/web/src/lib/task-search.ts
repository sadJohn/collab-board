import {
  MAX_PAGE_SIZE,
  SEARCH_QUERY_MAX_LENGTH,
  type SortOrder,
  type TaskStatus,
  taskStatusSchema,
} from "@repo/shared";
import { z } from "zod";

/** Sortable columns of the list view (the board keeps using `position`). */
export const TASK_LIST_SORT_FIELDS = ["priority", "dueDate", "updatedAt"] as const;
export type TaskListSortField = (typeof TASK_LIST_SORT_FIELDS)[number];

export const DEFAULT_TASK_LIST_PAGE_SIZE = 25;
export const DEFAULT_TASK_LIST_SORT_BY: TaskListSortField = "updatedAt";
export const DEFAULT_TASK_LIST_SORT_ORDER: SortOrder = "desc";

function toStatusList(value: unknown): TaskStatus[] {
  let raw: unknown[] = [];

  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string") {
    raw = value.split(",");
  }

  // Unknown statuses are dropped so a hand-written URL never breaks the page.
  return raw
    .map((item) => (typeof item === "string" ? item.trim() : item))
    .filter((item): item is TaskStatus => taskStatusSchema.safeParse(item).success);
}

/**
 * URL search contract of `/projects/$projectId/list`.
 *
 * `statuses` accepts both the router's JSON array form and a comma list.
 * `.catch(...)` keeps deep links resilient: an invalid `page` or `sortBy`
 * restores a usable view instead of throwing the router error boundary.
 */
export const taskListSearchSchema = z.object({
  q: z.string().trim().max(SEARCH_QUERY_MAX_LENGTH).catch(""),
  statuses: z.preprocess(toStatusList, z.array(taskStatusSchema)),
  sortBy: z.enum(TASK_LIST_SORT_FIELDS).catch(DEFAULT_TASK_LIST_SORT_BY),
  sortOrder: z.enum(["asc", "desc"]).catch(DEFAULT_TASK_LIST_SORT_ORDER),
  page: z.coerce.number().int().min(1).catch(1),
  pageSize: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).catch(DEFAULT_TASK_LIST_PAGE_SIZE),
});

export type TaskListSearch = z.output<typeof taskListSearchSchema>;

/** Used when linking into the list view without carrying a previous search. */
export const DEFAULT_TASK_LIST_SEARCH: TaskListSearch = {
  q: "",
  statuses: [],
  sortBy: DEFAULT_TASK_LIST_SORT_BY,
  sortOrder: DEFAULT_TASK_LIST_SORT_ORDER,
  page: 1,
  pageSize: DEFAULT_TASK_LIST_PAGE_SIZE,
};

/**
 * Sorts and deduplicates selected statuses before they are written to the URL,
 * so `["DONE","TODO"]` and `["TODO","DONE"]` share one cache entry.
 */
export function normalizeStatuses(statuses: readonly TaskStatus[]): TaskStatus[] {
  return [...new Set(statuses)].sort();
}

export interface BatchSummary {
  succeeded: number;
  failed: number;
}

/** Counts a `Promise.allSettled` result set for the batch feedback message. */
export function summarizeBatchResults(
  results: readonly PromiseSettledResult<unknown>[],
): BatchSummary {
  let succeeded = 0;
  let failed = 0;

  for (const result of results) {
    if (result.status === "fulfilled") {
      succeeded += 1;
    } else {
      failed += 1;
    }
  }

  return { succeeded, failed };
}

/** Maps a validated search object onto the API query parameters. */
export function toTaskListParams(search: TaskListSearch) {
  return {
    q: search.q || undefined,
    statuses: search.statuses.length > 0 ? search.statuses : undefined,
    sortBy: search.sortBy,
    sortOrder: search.sortOrder,
    page: search.page,
    pageSize: search.pageSize,
  };
}
