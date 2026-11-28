import { SOCKET_EVENTS } from "@repo/shared";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { queryKeys } from "../lib/query-keys";
import { socket } from "../lib/socket";
import { useActiveWorkspace } from "../lib/use-active-workspace";

/** Task/comment broadcasts that can change any dashboard aggregate. */
const DASHBOARD_EVENTS = [
  SOCKET_EVENTS.TASK_CREATED,
  SOCKET_EVENTS.TASK_UPDATED,
  SOCKET_EVENTS.TASK_MOVED,
  SOCKET_EVENTS.TASK_DELETED,
  SOCKET_EVENTS.COMMENT_ADDED,
] as const;

/**
 * Keeps the dashboard fresh while it is open.
 *
 * Task broadcasts are scoped to `project:${projectId}` rooms, so the dashboard
 * joins every project room of the active workspace while mounted. Any relevant
 * event invalidates the dashboard query, which refetches the authoritative
 * aggregates (stats, my tasks, project progress and charts) in one request.
 */
export function useDashboardRealtime(projectIds: string[]): void {
  const queryClient = useQueryClient();
  const organizationId = useActiveWorkspace().data?.id ?? "";
  // A stable dependency: a new array identity on every render must not re-join.
  const projectIdsKey = projectIds.join("|");

  useEffect(() => {
    if (!organizationId || !projectIdsKey) {
      return;
    }

    const ids = projectIdsKey.split("|");
    const joined = new Set<string>();

    const joinAll = () => {
      for (const projectId of ids) {
        socket.emit(SOCKET_EVENTS.JOIN_PROJECT_ROOM, { projectId });
        joined.add(projectId);
      }
    };

    const invalidateDashboard = () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard(organizationId) });
    };

    socket.on("connect", joinAll);
    for (const event of DASHBOARD_EVENTS) {
      socket.on(event, invalidateDashboard);
    }

    if (socket.connected) {
      joinAll();
    } else {
      socket.connect();
    }

    return () => {
      socket.off("connect", joinAll);
      for (const event of DASHBOARD_EVENTS) {
        socket.off(event, invalidateDashboard);
      }
      for (const projectId of joined) {
        socket.emit(SOCKET_EVENTS.LEAVE_PROJECT_ROOM, { projectId });
      }
    };
  }, [queryClient, organizationId, projectIdsKey]);
}
