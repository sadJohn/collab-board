import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import {
  MAX_PAGE_SIZE,
  TASK_STATUSES,
  type TaskDto,
  type TaskPageDto,
  type TaskStatus,
} from "@repo/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { TaskCard } from "@/components/task/task-card";
import { listMembers } from "@/lib/api/members";
import { listTasks, moveTask } from "@/lib/api/tasks";
import { MEMBERS_STALE_TIME_MS, queryKeys } from "@/lib/query-keys";
import { type BoardDropTarget, planTaskMove, type TaskMovePlan } from "@/lib/task-board";
import { tracker } from "@/lib/tracker";
import { useActiveWorkspace } from "@/lib/use-active-workspace";
import { useUiStore } from "@/stores/ui-store";
import { BoardColumn } from "./board-column";

const BOARD_FILTERS = {
  sortBy: "position",
  sortOrder: "asc",
  page: 1,
  pageSize: MAX_PAGE_SIZE,
} as const;

const COLUMN_PREFIX = "column:";

/** Keep cards still right after a drop so motion and dnd-kit do not fight. */
const SETTLE_MS = 200;

interface KanbanBoardProps {
  projectId: string;
}

export function KanbanBoard({ projectId }: KanbanBoardProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isSwitching } = useActiveWorkspace();
  const organizationId = data?.id ?? "";
  const setActiveTaskId = useUiStore((state) => state.setActiveTaskId);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<number | undefined>(undefined);
  const draggedRecently = useRef(false);

  useEffect(() => () => window.clearTimeout(settleTimer.current), []);

  const boardQueryKey = queryKeys.tasks.list(organizationId, projectId, BOARD_FILTERS);

  const tasksQuery = useQuery({
    queryKey: boardQueryKey,
    queryFn: () =>
      listTasks(projectId, {
        sortBy: "position",
        sortOrder: "asc",
        page: 1,
        pageSize: MAX_PAGE_SIZE,
      }),
    enabled: Boolean(organizationId) && !isSwitching,
  });

  const membersQuery = useQuery({
    queryKey: queryKeys.members.list(organizationId),
    queryFn: () => listMembers(organizationId),
    enabled: Boolean(organizationId) && !isSwitching,
    staleTime: MEMBERS_STALE_TIME_MS,
  });

  const membersById = useMemo(
    () => new Map((membersQuery.data ?? []).map((member) => [member.userId, member])),
    [membersQuery.data],
  );

  const tasks = tasksQuery.data?.items ?? [];

  const grouped = useMemo(() => {
    const map = new Map<TaskStatus, TaskDto[]>(TASK_STATUSES.map((status) => [status, []]));

    for (const task of tasks) {
      map.get(task.status)?.push(task);
    }
    for (const column of map.values()) {
      column.sort((a, b) => a.position - b.position);
    }

    return map;
  }, [tasks]);

  const moveMutation = useMutation({
    mutationFn: (variables: { taskId: string; plan: TaskMovePlan }) =>
      moveTask(variables.taskId, {
        status: variables.plan.status,
        previousTaskId: variables.plan.previousTaskId,
        nextTaskId: variables.plan.nextTaskId,
      }),
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey: boardQueryKey });

      const snapshot = queryClient.getQueryData<TaskPageDto>(boardQueryKey);

      if (snapshot) {
        queryClient.setQueryData<TaskPageDto>(boardQueryKey, {
          ...snapshot,
          items: variables.plan.tasks,
        });
      }

      return { snapshot };
    },
    onError: (_error, _variables, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData<TaskPageDto>(boardQueryKey, context.snapshot);
      }
      toast.error(t("board.moveFailed"));
    },
    onSettled: async () => {
      // The server may rebalance a column, so refetch the authoritative order.
      await queryClient.invalidateQueries({
        queryKey: queryKeys.tasks.all(organizationId, projectId),
      });
    },
  });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function startSettling() {
    setSettling(true);
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => {
      setSettling(false);
      draggedRecently.current = false;
    }, SETTLE_MS);
  }

  function handleDragStart(event: DragStartEvent) {
    draggedRecently.current = true;
    setDraggingId(String(event.active.id));
  }

  /** dnd-kit can emit a click after a drop; ignore it so a drag never opens the drawer. */
  function openTask(taskId: string) {
    if (draggedRecently.current) {
      return;
    }

    setActiveTaskId(taskId);
  }

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    startSettling();

    const { active, over } = event;

    if (!over) {
      return;
    }

    const overId = String(over.id);
    const target: BoardDropTarget = overId.startsWith(COLUMN_PREFIX)
      ? { type: "column", status: overId.slice(COLUMN_PREFIX.length) as TaskStatus }
      : { type: "task", taskId: overId };

    const plan = planTaskMove(tasks, String(active.id), target);

    if (!plan) {
      return;
    }

    const fromStatus = tasks.find((task) => task.id === String(active.id))?.status;
    if (fromStatus) {
      tracker.track("TASK_DRAGGED", { fromStatus, toStatus: plan.status });
    }

    moveMutation.mutate({ taskId: String(active.id), plan });
  }

  function handleDragCancel() {
    setDraggingId(null);
    startSettling();
  }

  if (tasksQuery.isError) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-5">
        <p className="text-destructive text-sm">{t("projects.loadFailed")}</p>
        <button
          className="font-medium text-primary text-sm underline-offset-4 hover:underline"
          onClick={() => void tasksQuery.refetch()}
          type="button"
        >
          {t("error.retry")}
        </button>
      </div>
    );
  }

  if (tasksQuery.isPending) {
    return <p className="text-muted-foreground text-sm">{t("board.loading")}</p>;
  }

  const activeTask = draggingId ? tasks.find((task) => task.id === draggingId) : undefined;
  const truncated = (tasksQuery.data?.total ?? 0) > MAX_PAGE_SIZE;
  const suppressLayout = Boolean(draggingId) || settling;

  return (
    <div className="flex flex-col gap-3">
      {truncated ? (
        <p className="rounded-md bg-muted px-3 py-2 text-muted-foreground text-xs">
          {t("board.truncated", { count: MAX_PAGE_SIZE })}
        </p>
      ) : null}

      <DndContext
        collisionDetection={closestCorners}
        onDragCancel={handleDragCancel}
        onDragEnd={handleDragEnd}
        onDragStart={handleDragStart}
        sensors={sensors}
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {TASK_STATUSES.map((status) => (
            <BoardColumn
              key={status}
              membersById={membersById}
              onOpenTask={openTask}
              projectId={projectId}
              status={status}
              suppressLayout={suppressLayout}
              tasks={grouped.get(status) ?? []}
            />
          ))}
        </div>

        <DragOverlay>
          {activeTask ? (
            <TaskCard assignee={membersById.get(activeTask.assigneeId ?? "")} task={activeTask} />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}
