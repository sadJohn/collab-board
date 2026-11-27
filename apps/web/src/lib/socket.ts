import type { ClientToServerEvents, ServerToClientEvents } from "@repo/shared";
import { io, type Socket } from "socket.io-client";

const socketUrl = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, "");

/** Typed Socket.IO client. Client listens to server events and emits room events. */
export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Single connection shared by the whole app.
 *
 * `autoConnect: false` keeps it idle until a project page mounts the realtime
 * hook, and `withCredentials` forwards the BetterAuth session cookie used by
 * the server's handshake middleware.
 */
export const socket: AppSocket = io(socketUrl, {
  autoConnect: false,
  withCredentials: true,
});
