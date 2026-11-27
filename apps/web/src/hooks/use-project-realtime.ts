import {
  type CommentAddedPayload,
  type CommentDeletedPayload,
  type CommentDto,
  SOCKET_EVENTS,
  type TaskCreatedPayload,
  type TaskDeletedPayload,
  type TaskDto,
  type TaskMovedPayload,
  type TaskUpdatedPayload,
} from "@repo/shared";
import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { useActiveOrganization, useSession } from "../lib/auth-client";
import { queryKeys } from "../lib/query-keys";
import { planRealtimeEvent, type RealtimeCachePlan } from "../lib/realtime-plan";
import { socket } from "../lib/socket";
import { useUiStore } from "../stores/ui-store";

/** Applies a validated realtime plan to the TanStack Query cache. */
function applyPlan(
  queryClient: QueryClient,
  plan: RealtimeCachePlan | null,
  organizationId: string,
  projectId: string,
): void {
  if (!plan) {
    return;
  }

  switch (plan.kind) {
    case "task-upsert": {
      const detailKey = queryKeys.tasks.detail(plan.task.id);
      // Only refresh the detail cache when the drawer has already loaded it.
      if (queryClient.getQueryData(detailKey)) {
        queryClient.setQueryData<TaskDto>(detailKey, plan.task);
      }
      if (plan.invalidateList) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.all(organizationId, projectId),
        });
      }
      return;
    }

    case "task-removed": {
      queryClient.removeQueries({ queryKey: queryKeys.tasks.detail(plan.taskId) });
      void queryClient.invalidateQueries({
        queryKey: queryKeys.tasks.all(organizationId, projectId),
      });
      return;
    }

    case "comment-added": {
      const key = queryKeys.tasks.comments(plan.taskId);
      const comments = queryClient.getQueryData<CommentDto[]>(key);
      if (comments && !comments.some((comment) => comment.id === plan.comment.id)) {
        queryClient.setQueryData<CommentDto[]>(key, [...comments, plan.comment]);
      }
      return;
    }

    case "comment-removed": {
      const key = queryKeys.tasks.comments(plan.taskId);
      const comments = queryClient.getQueryData<CommentDto[]>(key);
      if (comments) {
        queryClient.setQueryData<CommentDto[]>(
          key,
          comments.filter((comment) => comment.id !== plan.commentId),
        );
      }
      return;
    }
  }
}

/**
 * Mirrors project room broadcasts into the TanStack Query cache.
 *
 * Detail and comment caches are patched in place; list/board caches are
 * invalidated so the server stays authoritative. Reconnects invalidate again
 * to backfill anything missed while offline.
 */
export function useProjectRealtime(projectId: string): void {
  const queryClient = useQueryClient();
  const organizationId = useActiveOrganization().data?.id ?? "";
  const currentUserId = useSession().data?.user.id;
  const connectedBefore = useRef(false);

  useEffect(() => {
    if (!organizationId) {
      return;
    }

    const handle = (plan: RealtimeCachePlan | null) => {
      applyPlan(queryClient, plan, organizationId, projectId);
      // Dashboard aggregates (stats, my tasks, progress, charts) are derived
      // from the same tasks, so any project broadcast makes them stale.
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(organizationId) });
    };

    const onTaskCreated = (payload: TaskCreatedPayload) =>
      handle(planRealtimeEvent(SOCKET_EVENTS.TASK_CREATED, payload, currentUserId));
    const onTaskUpdated = (payload: TaskUpdatedPayload) =>
      handle(planRealtimeEvent(SOCKET_EVENTS.TASK_UPDATED, payload, currentUserId));
    const onTaskMoved = (payload: TaskMovedPayload) =>
      handle(planRealtimeEvent(SOCKET_EVENTS.TASK_MOVED, payload, currentUserId));
    const onTaskDeleted = (payload: TaskDeletedPayload) => {
      const plan = planRealtimeEvent(SOCKET_EVENTS.TASK_DELETED, payload, currentUserId);
      handle(plan);

      // Closing the drawer also drops the removed task's detail query.
      if (plan?.kind === "task-removed" && useUiStore.getState().activeTaskId === plan.taskId) {
        useUiStore.getState().setActiveTaskId(null);
      }
    };
    const onCommentAdded = (payload: CommentAddedPayload) =>
      handle(planRealtimeEvent(SOCKET_EVENTS.COMMENT_ADDED, payload, currentUserId));
    const onCommentDeleted = (payload: CommentDeletedPayload) =>
      handle(planRealtimeEvent(SOCKET_EVENTS.COMMENT_DELETED, payload, currentUserId));

    const onConnect = () => {
      // The first connect has no missed events; only reconnects need a backfill.
      if (connectedBefore.current) {
        void queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.all(organizationId, projectId),
        });
        void queryClient.invalidateQueries({ queryKey: ["tasks"] });
        void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(organizationId) });
      }
      connectedBefore.current = true;
    };

    socket.on(SOCKET_EVENTS.TASK_CREATED, onTaskCreated);
    socket.on(SOCKET_EVENTS.TASK_UPDATED, onTaskUpdated);
    socket.on(SOCKET_EVENTS.TASK_MOVED, onTaskMoved);
    socket.on(SOCKET_EVENTS.TASK_DELETED, onTaskDeleted);
    socket.on(SOCKET_EVENTS.COMMENT_ADDED, onCommentAdded);
    socket.on(SOCKET_EVENTS.COMMENT_DELETED, onCommentDeleted);
    socket.on("connect", onConnect);

    return () => {
      socket.off(SOCKET_EVENTS.TASK_CREATED, onTaskCreated);
      socket.off(SOCKET_EVENTS.TASK_UPDATED, onTaskUpdated);
      socket.off(SOCKET_EVENTS.TASK_MOVED, onTaskMoved);
      socket.off(SOCKET_EVENTS.TASK_DELETED, onTaskDeleted);
      socket.off(SOCKET_EVENTS.COMMENT_ADDED, onCommentAdded);
      socket.off(SOCKET_EVENTS.COMMENT_DELETED, onCommentDeleted);
      socket.off("connect", onConnect);
    };
  }, [queryClient, organizationId, projectId, currentUserId]);
}
