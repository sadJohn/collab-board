import { computePosition, type TaskDto, type TaskStatus } from "@repo/shared";

export type BoardDropTarget =
  | { type: "task"; taskId: string }
  | { type: "column"; status: TaskStatus };

export interface TaskMovePlan {
  taskId: string;
  status: TaskStatus;
  previousTaskId: string | null;
  nextTaskId: string | null;
  position: number;
  rebalanceRequired: boolean;
  /** Optimistically updated list; the input array is never mutated. */
  tasks: TaskDto[];
}

function sortByPosition(tasks: TaskDto[]): TaskDto[] {
  return [...tasks].sort((a, b) => a.position - b.position);
}

/**
 * Computes the drop target for a drag gesture.
 *
 * - Dropping on a column appends to its end.
 * - Dropping on a card inserts before it, matching dnd-kit's `arrayMove`
 *   semantics inside the same column (moving down lands after the hovered card).
 * - Neighbour positions are fed to the shared `computePosition`, so the web
 *   board and the server always derive the same fractional index.
 *
 * Returns `null` when the task is unknown or dropped onto itself.
 */
export function planTaskMove(
  tasks: TaskDto[],
  taskId: string,
  target: BoardDropTarget,
): TaskMovePlan | null {
  const moving = tasks.find((task) => task.id === taskId);

  if (!moving) {
    return null;
  }

  if (target.type === "task" && target.taskId === taskId) {
    return null;
  }

  const overTask =
    target.type === "task" ? tasks.find((task) => task.id === target.taskId) : undefined;

  if (target.type === "task" && !overTask) {
    return null;
  }

  const targetStatus =
    target.type === "column" ? target.status : (overTask?.status ?? moving.status);

  const columnTasks = sortByPosition(
    tasks.filter((task) => task.status === targetStatus && task.id !== taskId),
  );

  let insertIndex = columnTasks.length;

  if (target.type === "task") {
    const overIndex = columnTasks.findIndex((task) => task.id === target.taskId);

    if (overIndex !== -1) {
      insertIndex = overIndex;

      if (moving.status === targetStatus) {
        const originalIndex = sortByPosition(
          tasks.filter((task) => task.status === targetStatus),
        ).findIndex((task) => task.id === taskId);

        if (originalIndex < overIndex + 1 && originalIndex !== -1) {
          // Moving down inside the same column: land after the hovered card.
          insertIndex = overIndex + 1;
        }
      }
    }
  }

  const previousTask = insertIndex > 0 ? columnTasks[insertIndex - 1] : undefined;
  const nextTask = insertIndex < columnTasks.length ? columnTasks[insertIndex] : undefined;
  const { position, rebalanceRequired } = computePosition(
    previousTask?.position ?? null,
    nextTask?.position ?? null,
  );

  return {
    taskId,
    status: targetStatus,
    previousTaskId: previousTask?.id ?? null,
    nextTaskId: nextTask?.id ?? null,
    position,
    rebalanceRequired,
    tasks: tasks.map((task) =>
      task.id === taskId ? { ...task, status: targetStatus, position } : task,
    ),
  };
}
