import { Injectable, Logger } from "@nestjs/common";
import {
  type ClientToServerEvents,
  projectRoomName,
  type ServerToClientEvents,
  type SocketPayloadMap,
  socketPayloadSchemas,
  userRoomName,
} from "@repo/shared";
import type { Server } from "socket.io";
import type { ZodType } from "zod";

/** Socket.IO server typed with the shared client/server event maps. */
export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents>;

/** Untyped emit signature used to dispatch a dynamically selected event. */
type Broadcast = (event: string, payload: unknown) => boolean;

/** Every event that carries a schema-validated payload to project members. */
export type BroadcastableEvent = keyof typeof socketPayloadSchemas;

/**
 * Broadcasts realtime events to project rooms.
 *
 * The gateway owns the Socket.IO server and hands it over via `attachServer`,
 * so business modules never depend on the gateway itself.
 */
@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);
  private server: RealtimeServer | null = null;

  /** Called by the gateway once the Socket.IO server is initialized. */
  attachServer(server: RealtimeServer): void {
    this.server = server;
  }

  /**
   * Validates `payload` against the shared Zod schema, then broadcasts it to
   * `project:${projectId}`. Invalid payloads throw before anything is sent.
   */
  emitToProject<E extends BroadcastableEvent>(
    projectId: string,
    event: E,
    payload: SocketPayloadMap[E],
  ): void {
    this.broadcastToRoom(projectRoomName(projectId), event, payload);
  }

  /**
   * Validates `payload` and broadcasts it to a single user's private room
   * `user:${userId}`. Used for direct notifications (task assignment, comments).
   */
  emitToUser<E extends BroadcastableEvent>(
    userId: string,
    event: E,
    payload: SocketPayloadMap[E],
  ): void {
    this.broadcastToRoom(userRoomName(userId), event, payload);
  }

  /** Shared broadcast: schema-validate, then emit to the named room. */
  private broadcastToRoom<E extends BroadcastableEvent>(
    roomName: string,
    event: E,
    payload: SocketPayloadMap[E],
  ): void {
    const schema = socketPayloadSchemas[event] as unknown as ZodType<unknown>;
    const parsed = schema.parse(payload);

    if (!this.server) {
      this.logger.warn(`Socket server not ready, dropped "${event}" for room ${roomName}`);
      return;
    }

    const room = this.server.to(roomName);
    const broadcast = room.emit as unknown as Broadcast;
    // Keep `room` as the receiver: the operator's emit relies on `this.adapter`.
    broadcast.call(room, event, parsed);
  }
}
