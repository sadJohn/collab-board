import { Inject } from "@nestjs/common";
import {
  ConnectedSocket,
  MessageBody,
  type OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
} from "@nestjs/websockets";
import type { PrismaClient } from "@repo/db";
import {
  type ClientToServerEvents,
  type GetRoomPresencePayload,
  getRoomPresencePayloadSchema,
  type JoinProjectRoomPayload,
  joinProjectRoomSchema,
  type PresenceUser,
  projectRoomName,
  type RoomAck,
  roomPresenceUpdatedPayloadSchema,
  type ServerToClientEvents,
  SOCKET_EVENTS,
} from "@repo/shared";
import { fromNodeHeaders } from "better-auth/node";
import type { DefaultEventsMap, Server, Socket } from "socket.io";
import { auth } from "../auth/auth";
import type { AuthSession, AuthUser } from "../auth/auth.guard";
import { PRISMA_CLIENT } from "../prisma/prisma.module";
import { EventsService } from "./events.service";

/** Session-derived data kept on every authenticated socket. */
export interface SocketData {
  user: AuthUser;
  session: AuthSession;
}

export type GatewayServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

export type AuthenticatedSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

const corsOrigin = (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(",");

/** Prefix every project room uses. Filter out non-project rooms from disconnecting events. */
const PROJECT_ROOM_PREFIX = "project:";

/**
 * Project realtime gateway.
 *
 * Handles connection authentication (reusing the BetterAuth session from the
 * handshake cookie) and project room join/leave. It intentionally avoids
 * depending on business services; broadcasts go through `EventsService`.
 *
 * Presence aggregation is done in-memory via `fetchSockets()`, no DB / Redis —
 * see the Phase 7 tech-decision notes.
 */
@WebSocketGateway({ cors: { origin: corsOrigin, credentials: true } })
export class ProjectsGateway implements OnGatewayInit {
  constructor(
    private readonly events: EventsService,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  private server: GatewayServer | null = null;

  afterInit(server: GatewayServer): void {
    this.server = server;
    this.events.attachServer(server);

    server.use(async (socket, next) => {
      const session = await auth.api.getSession({
        headers: fromNodeHeaders(socket.handshake.headers),
      });

      if (!session) {
        next(new Error("Unauthorized"));
        return;
      }

      socket.data.user = session.user;
      socket.data.session = session.session;
      next();
    });

    // After auth succeeds, register `disconnecting` on the socket itself — it
    // fires *before* the socket leaves all rooms, so we can still enumerate
    // which project rooms it was in.
    server.on("connection", (socket) => {
      socket.on("disconnecting", () => {
        if (!("user" in socket.data) || !socket.data.user) return;

        for (const room of socket.rooms) {
          if (!room.startsWith(PROJECT_ROOM_PREFIX)) continue;
          const projectId = room.slice(PROJECT_ROOM_PREFIX.length);
          // Best-effort: if the server is mid-shutdown this is a no-op.
          void this.broadcastRoomPresence(projectId);
        }
      });
    });
  }

  /**
   * Aggregate sockets in `project:${projectId}` into a de-duplicated presence
   * snapshot and broadcast to that room. Safe to call when the server / room
   * is empty — emits an empty users array.
   *
   * Deduplication rule: one entry per unique `user.id`, so multiple tabs of
   * the same account collapse to a single avatar. Prevents ghost members.
   */
  private async broadcastRoomPresence(projectId: string): Promise<void> {
    const server = this.server;
    if (!server) return;

    const room = projectRoomName(projectId);
    const sockets = await server.in(room).fetchSockets();

    // De-duplicate by user.id — first one wins (they should all be equivalent
    // anyway, same session -> same user snapshot). Skip rows that would fail
    // the shared schema (auth session guarantees these fields, but defensive
    // filtering keeps presence payloads always parseable).
    const seen = new Set<string>();
    const users: PresenceUser[] = [];
    for (const s of sockets) {
      const u = s.data?.user;
      if (!u?.id || !u.name || !u.email || seen.has(u.id)) continue;
      seen.add(u.id);
      users.push({
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image ?? null,
      });
    }

    const payload = roomPresenceUpdatedPayloadSchema.parse({ projectId, users });
    server.to(room).emit(SOCKET_EVENTS.ROOM_PRESENCE_UPDATED, payload);
  }

  /**
   * Joins the project room only when the project belongs to the socket's active
   * organization and the authenticated user is a member of that organization.
   */
  @SubscribeMessage(SOCKET_EVENTS.JOIN_PROJECT_ROOM)
  async handleJoinProjectRoom(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: JoinProjectRoomPayload,
  ): Promise<RoomAck> {
    const parsed = joinProjectRoomSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: "INVALID_PAYLOAD" };
    }

    const { user, session } = socket.data;
    const organizationId = session.activeOrganizationId;
    if (!organizationId) {
      return { ok: false, error: "NO_ACTIVE_ORGANIZATION" };
    }

    const project = await this.prisma.project.findFirst({
      where: { id: parsed.data.projectId, organizationId },
      select: { id: true },
    });
    if (!project) {
      return { ok: false, error: "FORBIDDEN" };
    }

    const member = await this.prisma.member.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      select: { id: true },
    });
    if (!member) {
      return { ok: false, error: "FORBIDDEN" };
    }

    const room = projectRoomName(project.id);
    await socket.join(room);
    // Fire-and-forget — the client gets the ack immediately; the presence
    // broadcast lands asynchronously but the socket is already in the room.
    void this.broadcastRoomPresence(project.id);
    return { ok: true, room };
  }

  /** Leaves the project room. Leaving is idempotent and needs no ownership check. */
  @SubscribeMessage(SOCKET_EVENTS.LEAVE_PROJECT_ROOM)
  async handleLeaveProjectRoom(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: JoinProjectRoomPayload,
  ): Promise<RoomAck> {
    const parsed = joinProjectRoomSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: "INVALID_PAYLOAD" };
    }

    const room = projectRoomName(parsed.data.projectId);
    await socket.leave(room);
    void this.broadcastRoomPresence(parsed.data.projectId);
    return { ok: true, room };
  }

  /**
   * Optional client-initiated presence query. Handles the edge case where a
   * client joins a project *after* the first presence broadcast landed, or the
   * server restarted and in-memory room state was rebuilt before the next
   * join/leave trigger.
   */
  @SubscribeMessage(SOCKET_EVENTS.GET_ROOM_PRESENCE)
  async handleGetRoomPresence(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() payload: GetRoomPresencePayload,
  ): Promise<unknown> {
    const parsed = getRoomPresencePayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, error: "INVALID_PAYLOAD" };
    }

    // Same org/member check as JOIN — no blind trust of the client-supplied id.
    const { user, session } = socket.data;
    const organizationId = session.activeOrganizationId;
    if (!organizationId) {
      return { ok: false, error: "NO_ACTIVE_ORGANIZATION" };
    }

    const projectId = parsed.data.projectId;
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });
    if (!project) {
      return { ok: false, error: "FORBIDDEN" };
    }

    const member = await this.prisma.member.findUnique({
      where: { organizationId_userId: { organizationId, userId: user.id } },
      select: { id: true },
    });
    if (!member) {
      return { ok: false, error: "FORBIDDEN" };
    }

    // Return the same snapshot the broadcast would have sent.
    const server = this.server;
    if (!server) {
      return { ok: false, error: "SERVER_NOT_READY" };
    }

    const room = projectRoomName(projectId);
    const sockets = await server.in(room).fetchSockets();
    const seen = new Set<string>();
    const users: PresenceUser[] = [];
    for (const s of sockets) {
      const u = s.data?.user;
      if (!u?.id || !u.name || !u.email || seen.has(u.id)) continue;
      seen.add(u.id);
      users.push({
        id: u.id,
        name: u.name,
        email: u.email,
        image: u.image ?? null,
      });
    }

    return roomPresenceUpdatedPayloadSchema.parse({ projectId, users });
  }
}
