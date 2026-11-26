import { TASK_STATUSES, type TaskDto, type TaskStatus } from "@repo/shared";
import { Button, Input } from "@repo/ui";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  type RowSelectionState,
  useReactTable,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { listMembers } from "../../../../lib/api/members";
import { deleteTask, listTasks, updateTask } from "../../../../lib/api/tasks";
import { useActiveOrganization } from "../../../../lib/auth-client";
import { MEMBERS_STALE_TIME_MS, queryKeys } from "../../../../lib/query-keys";
import {
  type BatchSummary,
  normalizeStatuses,
  summarizeBatchResults,
  type TaskListSortField,
  taskListSearchSchema,
  toTaskListParams,
} from "../../../../lib/task-search";
import { useUiStore } from "../../../../stores/ui-store";

export const Route = createFileRoute("/_app/projects/$projectId/list")({
  validateSearch: taskListSearchSchema,
  component: ProjectListPage,
});

const columnHelper = createColumnHelper<TaskDto>();

const CELL_CLASS = "px-3 py-2 text-left align-middle";
const HEADER_CLASS = "px-3 py-2 text-left font-medium text-muted-foreground text-xs uppercase";

function ProjectListPage() {
  const { projectId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const { t, i18n } = useTranslation();
  const queryClient = useQueryClient();
  const activeOrganization = useActiveOrganization();
  const organizationId = activeOrganization.data?.id ?? "";
  const setActiveTaskId = useUiStore((state) => state.setActiveTaskId);

  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const [searchInput, setSearchInput] = useState(search.q);
  const [batchStatus, setBatchStatus] = useState<TaskStatus>("TODO");
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const [batchRunning, setBatchRunning] = useState(false);

  const statusKey = search.statuses.join(",");
  const filterKey = [
    search.q,
    statusKey,
    search.sortBy,
    search.sortOrder,
    search.page,
    search.pageSize,
  ].join("|");

  // Keep the input in sync when the URL changes from back/forward navigation.
  useEffect(() => {
    setSearchInput(search.q);
  }, [search.q]);

  // Debounce typing before it is written back to the URL (page resets to 1).
  useEffect(() => {
    if (searchInput === search.q) {
      return;
    }

    const timer = setTimeout(() => {
      void navigate({
        search: (prev) => ({ ...prev, q: searchInput, page: 1 }),
        replace: true,
      });
    }, 300);

    return () => clearTimeout(timer);
  }, [searchInput, search.q, navigate]);

  const [appliedFilterKey, setAppliedFilterKey] = useState(filterKey);

  // A selection made under one filter must not leak into the next one.
  useEffect(() => {
    if (appliedFilterKey === filterKey) {
      return;
    }

    setAppliedFilterKey(filterKey);
    setRowSelection({});
    setBatchSummary(null);
  }, [filterKey, appliedFilterKey]);

  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks.list(organizationId, projectId, {
      q: search.q,
      statuses: search.statuses,
      sortBy: search.sortBy,
      sortOrder: search.sortOrder,
      page: search.page,
      pageSize: search.pageSize,
    }),
    queryFn: () => listTasks(projectId, toTaskListParams(search)),
    enabled: Boolean(organizationId),
    placeholderData: keepPreviousData,
  });

  const membersQuery = useQuery({
    queryKey: queryKeys.members.list(organizationId),
    queryFn: () => listMembers(organizationId),
    enabled: Boolean(organizationId),
    staleTime: MEMBERS_STALE_TIME_MS,
  });

  const membersById = useMemo(
    () => new Map((membersQuery.data ?? []).map((member) => [member.userId, member])),
    [membersQuery.data],
  );

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "medium" }),
    [i18n.language],
  );

  const handleSort = useCallback(
    (field: TaskListSortField) => {
      void navigate({
        search: (prev) => ({
          ...prev,
          sortBy: field,
          sortOrder: prev.sortBy === field && prev.sortOrder === "asc" ? "desc" : "asc",
          page: 1,
        }),
        replace: true,
      });
    },
    [navigate],
  );

  const columns = useMemo(() => {
    const sortableHeader = (field: TaskListSortField, label: string) => {
      const active = search.sortBy === field;
      const indicator = active ? (search.sortOrder === "asc" ? " ↑" : " ↓") : "";
      return (
        <button
          className="font-medium text-muted-foreground text-xs uppercase hover:text-foreground"
          onClick={() => handleSort(field)}
          type="button"
        >
          {label}
          {indicator}
        </button>
      );
    };

    return [
      columnHelper.display({
        id: "select",
        header: ({ table }) => (
          <input
            aria-label={t("projects.list.selectAll")}
            checked={table.getIsAllPageRowsSelected()}
            onChange={table.getToggleAllPageRowsSelectedHandler()}
            type="checkbox"
          />
        ),
        cell: ({ row }) => (
          <input
            aria-label={t("projects.list.selectRow")}
            checked={row.getIsSelected()}
            disabled={!row.getCanSelect()}
            onChange={row.getToggleSelectedHandler()}
            type="checkbox"
          />
        ),
      }),
      columnHelper.accessor("title", {
        header: t("projects.list.columns.title"),
        cell: (info) => (
          <button
            className="text-left font-medium hover:underline"
            onClick={() => setActiveTaskId(info.row.original.id)}
            type="button"
          >
            {info.getValue()}
          </button>
        ),
      }),
      columnHelper.accessor("status", {
        header: t("projects.list.columns.status"),
        cell: (info) => t(`taskStatus.${info.getValue()}`),
      }),
      columnHelper.accessor("priority", {
        header: () => sortableHeader("priority", t("projects.list.columns.priority")),
        cell: (info) => t(`taskPriority.${info.getValue()}`),
      }),
      columnHelper.accessor(
        (task) => (task.assigneeId ? (membersById.get(task.assigneeId)?.name ?? "") : ""),
        {
          id: "assignee",
          header: t("projects.list.columns.assignee"),
          cell: (info) => info.getValue() || t("projects.list.unassigned"),
        },
      ),
      columnHelper.accessor("dueDate", {
        header: () => sortableHeader("dueDate", t("projects.list.columns.dueDate")),
        cell: (info) => {
          const value = info.getValue();
          return value ? dateFormatter.format(new Date(value)) : "—";
        },
      }),
      columnHelper.accessor("updatedAt", {
        header: () => sortableHeader("updatedAt", t("projects.list.columns.updatedAt")),
        cell: (info) => dateFormatter.format(new Date(info.getValue())),
      }),
    ];
  }, [t, membersById, dateFormatter, search.sortBy, search.sortOrder, handleSort, setActiveTaskId]);

  const tasks = tasksQuery.data?.items ?? [];
  const total = tasksQuery.data?.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / search.pageSize));

  const table = useReactTable({
    data: tasks,
    columns,
    getRowId: (task) => task.id,
    getCoreRowModel: getCoreRowModel(),
    state: { rowSelection },
    onRowSelectionChange: setRowSelection,
    manualPagination: true,
    manualSorting: true,
    manualFiltering: true,
  });

  function toggleStatus(status: TaskStatus) {
    const next = search.statuses.includes(status)
      ? search.statuses.filter((item) => item !== status)
      : [...search.statuses, status];

    void navigate({
      search: (prev) => ({ ...prev, statuses: normalizeStatuses(next), page: 1 }),
      replace: true,
    });
  }

  function goToPage(page: number) {
    void navigate({ search: (prev) => ({ ...prev, page }), replace: true });
  }

  async function runBatch(operation: (task: TaskDto) => Promise<unknown>) {
    const selected = table.getSelectedRowModel().rows.map((row) => row.original);

    if (selected.length === 0) {
      return;
    }

    setBatchRunning(true);
    setBatchSummary(null);

    try {
      const results = await Promise.allSettled(selected.map(operation));
      setBatchSummary(summarizeBatchResults(results));
      table.resetRowSelection();
    } finally {
      setBatchRunning(false);
      await queryClient.invalidateQueries({
        queryKey: queryKeys.tasks.all(organizationId, projectId),
      });
    }
  }

  const selectedCount = table.getSelectedRowModel().rows.length;
  const hasFilters = Boolean(search.q) || search.statuses.length > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label={t("projects.list.searchPlaceholder")}
          className="max-w-xs"
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder={t("projects.list.searchPlaceholder")}
          value={searchInput}
        />

        <fieldset className="flex flex-wrap items-center gap-3">
          <legend className="sr-only">{t("projects.list.filterStatus")}</legend>
          {TASK_STATUSES.map((status) => (
            <label className="flex items-center gap-1.5 text-sm" key={status}>
              <input
                checked={search.statuses.includes(status)}
                onChange={() => toggleStatus(status)}
                type="checkbox"
              />
              {t(`taskStatus.${status}`)}
            </label>
          ))}
        </fieldset>
      </div>

      {selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-4 py-3">
          <span className="text-sm">{t("projects.list.selected", { count: selectedCount })}</span>

          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor="batch-status">
              {t("projects.list.batchStatusLabel")}
            </label>
            <select
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
              id="batch-status"
              onChange={(event) => setBatchStatus(event.target.value as TaskStatus)}
              value={batchStatus}
            >
              {TASK_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {t(`taskStatus.${status}`)}
                </option>
              ))}
            </select>
            <Button
              disabled={batchRunning}
              onClick={() => void runBatch((task) => updateTask(task.id, { status: batchStatus }))}
              size="sm"
              variant="outline"
            >
              {t("projects.list.batchApply")}
            </Button>
          </div>

          <Button
            disabled={batchRunning}
            onClick={() => void runBatch((task) => deleteTask(task.id))}
            size="sm"
            variant="destructive"
          >
            {t("projects.list.batchDelete")}
          </Button>
        </div>
      ) : null}

      {batchSummary ? (
        <p className="text-muted-foreground text-sm" role="status">
          {t("projects.list.batchResult", {
            succeeded: batchSummary.succeeded,
            failed: batchSummary.failed,
          })}
        </p>
      ) : null}

      {tasksQuery.isError ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-5">
          <p className="text-destructive text-sm">{t("projects.loadFailed")}</p>
          <Button onClick={() => void tasksQuery.refetch()} variant="outline">
            {t("error.retry")}
          </Button>
        </div>
      ) : null}

      {!tasksQuery.isError && tasksQuery.isPending ? (
        <p className="text-muted-foreground text-sm">{t("projects.list.loading")}</p>
      ) : null}

      {!tasksQuery.isError && !tasksQuery.isPending && tasks.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card p-8 text-muted-foreground text-sm">
          {hasFilters ? t("projects.list.emptyFiltered") : t("projects.list.empty")}
        </p>
      ) : null}

      {!tasksQuery.isError && tasks.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/50">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <th className={HEADER_CLASS} key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map((row) => (
                <tr className="border-b last:border-b-0 hover:bg-accent/50" key={row.id}>
                  {row.getVisibleCells().map((cell) => (
                    <td className={CELL_CLASS} key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {total > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-sm">
          <span>{t("projects.list.total", { total })}</span>
          <div className="flex items-center gap-2">
            <Button
              disabled={search.page <= 1}
              onClick={() => goToPage(search.page - 1)}
              size="sm"
              variant="outline"
            >
              {t("projects.list.prev")}
            </Button>
            <span>{t("projects.list.page", { page: search.page, pages: pageCount })}</span>
            <Button
              disabled={search.page >= pageCount}
              onClick={() => goToPage(search.page + 1)}
              size="sm"
              variant="outline"
            >
              {t("projects.list.next")}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
