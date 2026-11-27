import { type RoomAck, SOCKET_EVENTS } from "@repo/shared";
import { useEffect } from "react";

import { socket } from "../lib/socket";

/**
 * Connects the shared socket and joins `project:${projectId}`.
 *
 * Re-joins automatically after reconnects, leaves the previous room when the
 * project changes (React runs the old cleanup first) and cleans up its own
 * listeners on unmount.
 */
export function useProjectRoom(projectId: string): void {
  useEffect(() => {
    const join = () => {
      socket.emit(SOCKET_EVENTS.JOIN_PROJECT_ROOM, { projectId }, (ack: RoomAck) => {
        if (!ack.ok) {
          console.warn(`[realtime] failed to join project ${projectId}: ${ack.error}`);
        }
      });
    };

    const handleConnect = () => {
      join();
    };

    socket.on("connect", handleConnect);

    if (socket.connected) {
      join();
    } else {
      socket.connect();
    }

    return () => {
      socket.off("connect", handleConnect);
      socket.emit(SOCKET_EVENTS.LEAVE_PROJECT_ROOM, { projectId });
    };
  }, [projectId]);
}
