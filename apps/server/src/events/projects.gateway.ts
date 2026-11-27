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
  type JoinProjectRoomPayload,
  joinProjectRoomSchema,
  projectRoomName,
  type RoomAck,
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

/**
 * Project realtime gateway.
 *
 * Handles connection authentication (reusing the BetterAuth session from the
 * handshake cookie) and project room join/leave. It intentionally avoids
 * depending on business services; broadcasts go through `EventsService`.
 */
@WebSocketGateway({ cors: { origin: corsOrigin, credentials: true } })
export class ProjectsGateway implements OnGatewayInit {
  constructor(
    private readonly events: EventsService,
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
  ) {}

  afterInit(server: GatewayServer): void {
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
    return { ok: true, room };
  }
}
