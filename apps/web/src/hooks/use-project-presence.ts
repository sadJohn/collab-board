import {
  getRoomPresencePayloadSchema,
  type PresenceUser,
  roomPresenceUpdatedPayloadSchema,
  SOCKET_EVENTS,
} from "@repo/shared";
import { useEffect, useState } from "react";

import { socket } from "@/lib/socket";

/**
 * Tracks who is currently online in `project:${projectId}`.
 *
 * Presence is **NOT** written to Zustand — the decision was deliberate:
 *   - It's purely server-pushed, no optimistic updates.
 *   - It only makes sense inside the context of a single project layout.
 *   - It's cheap (a handful of users) and easy to keep local.
 *
 * The hook subscribes to `ROOM_PRESENCE_UPDATED` and additionally fires a
 * `GET_ROOM_PRESENCE` query on (re)connect as a fallback for edge cases
 * where the first broadcast landed before this component mounted.
 */
export function useProjectPresence(projectId: string): PresenceUser[] {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    // Always reset on project change — the new room has a fresh roster.
    setUsers([]);

    const onPresence = (raw: unknown) => {
      const parsed = roomPresenceUpdatedPayloadSchema.safeParse(raw);
      if (!parsed.success) {
        console.warn("[presence] malformed presence payload", parsed.error.issues);
        return;
      }
      // Ignore broadcasts targeting a different project (defensive — we
      // shouldn't subscribe to those, but sockets can still see them in race
      // conditions during project switches).
      if (parsed.data.projectId !== projectId) {
        return;
      }
      setUsers(parsed.data.users);
    };

    // Optional fallback: ask the server after every connect. The gateway
    // already broadcasts presence on JOIN, but this covers the rare window
    // where the client mounted after a connect race.
    const onConnect = () => {
      const payload = getRoomPresencePayloadSchema.safeParse({ projectId });
      if (!payload.success) return;

      // Short delay so the JOIN_ROOM we fired in useProjectRoom has settled.
      setTimeout(() => {
        socket.emit(SOCKET_EVENTS.GET_ROOM_PRESENCE, payload.data, (ack: unknown) => {
          const parsedAck = roomPresenceUpdatedPayloadSchema.safeParse(ack);
          if (parsedAck.success && parsedAck.data.projectId === projectId) {
            setUsers(parsedAck.data.users);
          }
        });
      }, 150);
    };

    socket.on(SOCKET_EVENTS.ROOM_PRESENCE_UPDATED, onPresence);
    socket.on("connect", onConnect);

    // If the socket is already connected, fire the fallback immediately.
    if (socket.connected) {
      onConnect();
    }

    return () => {
      socket.off(SOCKET_EVENTS.ROOM_PRESENCE_UPDATED, onPresence);
      socket.off("connect", onConnect);
    };
  }, [projectId]);

  return users;
}
