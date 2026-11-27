import {
  type CommentDto,
  commentAddedPayloadSchema,
  commentDeletedPayloadSchema,
  SOCKET_EVENTS,
  type TaskDto,
  taskCreatedPayloadSchema,
  taskDeletedPayloadSchema,
  taskMovedPayloadSchema,
  taskUpdatedPayloadSchema,
} from "@repo/shared";

/** Server-to-client events that mutate project caches. */
export const REALTIME_EVENTS = [
  SOCKET_EVENTS.TASK_CREATED,
  SOCKET_EVENTS.TASK_UPDATED,
  SOCKET_EVENTS.TASK_MOVED,
  SOCKET_EVENTS.TASK_DELETED,
  SOCKET_EVENTS.COMMENT_ADDED,
  SOCKET_EVENTS.COMMENT_DELETED,
] as const;

export type RealtimeEvent = (typeof REALTIME_EVENTS)[number];

/**
 * Cache mutation derived from a realtime payload.
 *
 * Plans are pure data so the event → cache mapping can be unit-tested without
 * a socket or a query client.
 */
export type RealtimeCachePlan =
  | { kind: "task-upsert"; task: TaskDto; invalidateList: boolean }
  | { kind: "task-removed"; taskId: string }
  | { kind: "comment-added"; taskId: string; comment: CommentDto }
  | { kind: "comment-removed"; taskId: string; commentId: string };

/**
 * Validates the raw payload at the boundary and maps it to a cache plan.
 *
 * Returns `null` for invalid payloads and for the local user's own
 * `TASK_MOVED` broadcasts, whose optimistic update must not be refetched
 * (that would make the card flicker back and forth).
 */
export function planRealtimeEvent(
  event: RealtimeEvent,
  payload: unknown,
  currentUserId?: string,
): RealtimeCachePlan | null {
  switch (event) {
    case SOCKET_EVENTS.TASK_CREATED: {
      const parsed = taskCreatedPayloadSchema.safeParse(payload);
      return parsed.success
        ? { kind: "task-upsert", task: parsed.data.task, invalidateList: true }
        : null;
    }

    case SOCKET_EVENTS.TASK_UPDATED: {
      const parsed = taskUpdatedPayloadSchema.safeParse(payload);
      return parsed.success
        ? { kind: "task-upsert", task: parsed.data.task, invalidateList: true }
        : null;
    }

    case SOCKET_EVENTS.TASK_MOVED: {
      const parsed = taskMovedPayloadSchema.safeParse(payload);
      if (!parsed.success) {
        return null;
      }
      if (currentUserId && parsed.data.actorId === currentUserId) {
        return null;
      }
      return { kind: "task-upsert", task: parsed.data.task, invalidateList: true };
    }

    case SOCKET_EVENTS.TASK_DELETED: {
      const parsed = taskDeletedPayloadSchema.safeParse(payload);
      return parsed.success ? { kind: "task-removed", taskId: parsed.data.taskId } : null;
    }

    case SOCKET_EVENTS.COMMENT_ADDED: {
      const parsed = commentAddedPayloadSchema.safeParse(payload);
      return parsed.success
        ? {
            kind: "comment-added",
            taskId: parsed.data.comment.taskId,
            comment: parsed.data.comment,
          }
        : null;
    }

    case SOCKET_EVENTS.COMMENT_DELETED: {
      const parsed = commentDeletedPayloadSchema.safeParse(payload);
      return parsed.success
        ? {
            kind: "comment-removed",
            taskId: parsed.data.taskId,
            commentId: parsed.data.commentId,
          }
        : null;
    }
  }
}
