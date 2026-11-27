import { type OnGatewayInit, WebSocketGateway } from "@nestjs/websockets";
import type { ClientToServerEvents, ServerToClientEvents } from "@repo/shared";
import { fromNodeHeaders } from "better-auth/node";
import type { DefaultEventsMap, Server } from "socket.io";
import { auth } from "../auth/auth";
import type { AuthUser } from "../auth/auth.guard";
import type { EventsService } from "./events.service";

/** Session-derived data kept on every authenticated socket. */
export interface SocketData {
  user: AuthUser;
}

export type GatewayServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  DefaultEventsMap,
  SocketData
>;

/**
 * Project realtime gateway.
 *
 * Handles connection authentication (reusing the BetterAuth session from the
 * handshake cookie) and, from 5.4 on, project room join/leave. It intentionally
 * avoids depending on business services; broadcasts go through `EventsService`.
 */
@WebSocketGateway()
export class ProjectsGateway implements OnGatewayInit {
  constructor(private readonly events: EventsService) {}

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
      next();
    });
  }
}
