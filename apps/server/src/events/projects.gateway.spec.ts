import type { PrismaClient } from "@repo/db";
import { SOCKET_EVENTS } from "@repo/shared";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { auth } from "../auth/auth";
import type { EventsService } from "./events.service";
import { type AuthenticatedSocket, type GatewayServer, ProjectsGateway } from "./projects.gateway";

vi.mock("../auth/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

// The gateway only injects the Prisma client, so importing the real package
// (which requires DATABASE_URL_POOLED) is unnecessary here.
vi.mock("@repo/db", () => ({ prisma: {} }));

interface SessionResult {
  user: { id: string; name?: string; email?: string; image?: string | null };
  session: { id: string; activeOrganizationId: string | null };
}

const getSession = vi.mocked(auth.api.getSession) as unknown as Mock<
  (args: { headers: Headers }) => Promise<SessionResult | null>
>;

interface FakeSocket {
  handshake: { headers: Record<string, string> };
  data: {
    user?: SessionResult["user"];
    session?: SessionResult["session"];
  };
}

type ConnectionMiddleware = (socket: FakeSocket, next: (error?: Error) => void) => Promise<void>;

/**
 * Builds a richer server mock that supports:
 *   server.use()                           → connection middleware
 *   server.on('connection', cb)            → disconnecting hook registration
 *   server.in(room).fetchSockets()         → presence aggregation source
 *   server.to(room).emit(event, payload)   → presence broadcast sink
 */
function createPresenceServerMock() {
  const use = vi.fn();
  const emit = vi.fn();
  const fetchSockets = vi.fn();
  const connectionHandlers: Array<(socket: unknown) => void> = [];

  const to = vi.fn().mockReturnValue({ emit });
  const inMethod = vi.fn().mockReturnValue({ fetchSockets });
  const on = vi.fn((event: string, cb: (socket: unknown) => void) => {
    if (event === "connection") connectionHandlers.push(cb);
  });

  const server = { use, to, in: inMethod, on } as unknown as GatewayServer;

  /** Manually fire the connection handler to register disconnecting on a socket. */
  const triggerConnection = (socket: unknown) => {
    for (const h of connectionHandlers) h(socket);
  };

  return {
    server,
    use,
    emit,
    fetchSockets,
    to,
    inMethod,
    connectionHandlers,
    triggerConnection,
  };
}

function createGateway() {
  const projectFindFirst = vi.fn();
  const memberFindUnique = vi.fn();
  const prisma = {
    project: { findFirst: projectFindFirst },
    member: { findUnique: memberFindUnique },
  } as unknown as PrismaClient;

  const events = { attachServer: vi.fn() } as unknown as EventsService;
  const { server, ...rest } = createPresenceServerMock();
  const gateway = new ProjectsGateway(events, prisma);
  gateway.afterInit(server);

  const middleware = rest.use.mock.calls[0]?.[0] as unknown as ConnectionMiddleware;
  if (!middleware) {
    throw new Error("connection middleware was not registered");
  }

  return {
    gateway,
    middleware,
    events,
    ...rest,
    projectFindFirst,
    memberFindUnique,
    prisma,
  };
}

/** Build a fake authenticated socket with full user fields (presence needs name/email/image). */
function createPresenceSocket(
  overrides: Partial<SessionResult["user"]> = {},
  session: SessionResult["session"] = { id: "session_1", activeOrganizationId: "org_1" },
) {
  const baseUser: SessionResult["user"] = {
    id: "user_1",
    name: "Alice",
    email: "alice@example.com",
    image: null,
  };
  const join = vi.fn().mockResolvedValue(undefined);
  const leave = vi.fn().mockResolvedValue(undefined);
  const socket: FakeSocket & {
    join: Mock;
    leave: Mock;
    rooms?: Set<string>;
    on?: Mock;
  } = {
    data: { user: { ...baseUser, ...overrides }, session },
    join,
    leave,
    rooms: new Set<string>(),
    on: vi.fn(),
    handshake: { headers: {} },
  };

  return { socket: socket as unknown as AuthenticatedSocket, join, leave };
}

function sentHeaders(): Headers {
  const call = getSession.mock.calls[0];
  if (!call) {
    throw new Error("getSession was not called");
  }
  return call[0].headers;
}

describe("ProjectsGateway handshake auth", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("rejects connections without a session cookie", async () => {
    getSession.mockResolvedValue(null);
    const { middleware, events } = createGateway();
    const client: FakeSocket = { handshake: { headers: {} }, data: {} };
    const next = vi.fn();

    await middleware(client, next);

    expect(events.attachServer).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe("Unauthorized");
    expect(client.data.user).toBeUndefined();
    expect(sentHeaders().get("cookie")).toBeNull();
  });

  it("rejects invalid or expired sessions", async () => {
    getSession.mockResolvedValue(null);
    const { middleware } = createGateway();
    const client: FakeSocket = {
      handshake: { headers: { cookie: "better-auth.session_token=stale" } },
      data: {},
    };
    const next = vi.fn();

    await middleware(client, next);

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(client.data.user).toBeUndefined();
    expect(sentHeaders().get("cookie")).toBe("better-auth.session_token=stale");
  });

  it("accepts a valid session and stores the user and session on the socket", async () => {
    const result: SessionResult = {
      user: { id: "user_1", name: "Alice", email: "a@b.com", image: null },
      session: { id: "session_1", activeOrganizationId: "org_1" },
    };
    getSession.mockResolvedValue(result);
    const { middleware } = createGateway();
    const client: FakeSocket = {
      handshake: { headers: { cookie: "better-auth.session_token=fresh" } },
      data: {},
    };
    const next = vi.fn();

    await middleware(client, next);

    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(client.data.user).toEqual(result.user);
    expect(client.data.session).toEqual(result.session);
    expect(sentHeaders().get("cookie")).toBe("better-auth.session_token=fresh");
  });
});

describe("ProjectsGateway rooms", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("joins the project room when the project is in the active organization and the user is a member", async () => {
    const { gateway, projectFindFirst, memberFindUnique, emit, fetchSockets } = createGateway();
    projectFindFirst.mockResolvedValue({ id: "project_1" });
    memberFindUnique.mockResolvedValue({ id: "member_1" });
    fetchSockets.mockResolvedValue([]);
    const { socket, join } = createPresenceSocket();

    await expect(
      gateway.handleJoinProjectRoom(socket, { projectId: "project_1" }),
    ).resolves.toEqual({ ok: true, room: "project:project_1" });

    expect(projectFindFirst).toHaveBeenCalledWith({
      where: { id: "project_1", organizationId: "org_1" },
      select: { id: true },
    });
    expect(memberFindUnique).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: "org_1", userId: "user_1" } },
      select: { id: true },
    });
    expect(join).toHaveBeenCalledExactlyOnceWith("project:project_1");
    // Presence broadcast must fire after successful join.
    await Promise.resolve(); // drain microtask (broadcastRoomPresence is void)
    expect(fetchSockets).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.ROOM_PRESENCE_UPDATED,
      expect.objectContaining({ projectId: "project_1" }),
    );
  });

  it("refuses projects from another organization", async () => {
    const { gateway, projectFindFirst, memberFindUnique, emit, fetchSockets } = createGateway();
    projectFindFirst.mockResolvedValue(null);
    const { socket, join } = createPresenceSocket();

    await expect(
      gateway.handleJoinProjectRoom(socket, { projectId: "project_other" }),
    ).resolves.toEqual({ ok: false, error: "FORBIDDEN" });

    expect(memberFindUnique).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(fetchSockets).not.toHaveBeenCalled();
  });

  it("refuses users who are not members of the organization", async () => {
    const { gateway, projectFindFirst, memberFindUnique, emit, fetchSockets } = createGateway();
    projectFindFirst.mockResolvedValue({ id: "project_1" });
    memberFindUnique.mockResolvedValue(null);
    const { socket, join } = createPresenceSocket();

    await expect(
      gateway.handleJoinProjectRoom(socket, { projectId: "project_1" }),
    ).resolves.toEqual({ ok: false, error: "FORBIDDEN" });

    expect(join).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
    expect(fetchSockets).not.toHaveBeenCalled();
  });

  it("refuses to join without an active organization", async () => {
    const { gateway, projectFindFirst, memberFindUnique, emit } = createGateway();
    const { socket, join } = createPresenceSocket(undefined, {
      id: "session_1",
      activeOrganizationId: null,
    });

    await expect(
      gateway.handleJoinProjectRoom(socket, { projectId: "project_1" }),
    ).resolves.toEqual({ ok: false, error: "NO_ACTIVE_ORGANIZATION" });

    expect(projectFindFirst).not.toHaveBeenCalled();
    expect(memberFindUnique).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("rejects malformed join payloads", async () => {
    const { gateway, projectFindFirst, emit } = createGateway();
    const { socket, join } = createPresenceSocket();

    await expect(gateway.handleJoinProjectRoom(socket, { projectId: "" })).resolves.toEqual({
      ok: false,
      error: "INVALID_PAYLOAD",
    });

    expect(projectFindFirst).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("leaves the project room and broadcasts presence", async () => {
    const { gateway, emit, fetchSockets } = createGateway();
    fetchSockets.mockResolvedValue([]);
    const { socket, leave } = createPresenceSocket();

    await expect(
      gateway.handleLeaveProjectRoom(socket, { projectId: "project_1" }),
    ).resolves.toEqual({ ok: true, room: "project:project_1" });

    expect(leave).toHaveBeenCalledExactlyOnceWith("project:project_1");
    await Promise.resolve();
    expect(fetchSockets).toHaveBeenCalled();
    expect(emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.ROOM_PRESENCE_UPDATED,
      expect.objectContaining({ projectId: "project_1", users: [] }),
    );
  });
});

describe("ProjectsGateway presence aggregation", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("de-duplicates presence by user.id (same user, two tabs)", async () => {
    const { gateway, projectFindFirst, memberFindUnique, emit, fetchSockets } = createGateway();
    projectFindFirst.mockResolvedValue({ id: "project_1" });
    memberFindUnique.mockResolvedValue({ id: "member_1" });

    // Two sockets, both belong to the same user Alice.
    fetchSockets.mockResolvedValue([
      { data: { user: { id: "user_1", name: "Alice", email: "a@b.com", image: null } } },
      { data: { user: { id: "user_1", name: "Alice", email: "a@b.com", image: null } } },
    ]);

    const { socket } = createPresenceSocket({ id: "user_1" });

    await gateway.handleJoinProjectRoom(socket, { projectId: "project_1" });
    await Promise.resolve();

    const emittedPayload = emit.mock.calls.find(
      ([event]) => event === SOCKET_EVENTS.ROOM_PRESENCE_UPDATED,
    )?.[1] as { projectId: string; users: unknown[] } | undefined;

    expect(emittedPayload?.projectId).toBe("project_1");
    expect(emittedPayload?.users).toHaveLength(1);
    expect(emittedPayload?.users[0]).toMatchObject({
      id: "user_1",
      name: "Alice",
      email: "a@b.com",
      image: null,
    });
  });

  it("includes distinct users and filters sockets missing name/email", async () => {
    const { gateway, projectFindFirst, memberFindUnique, emit, fetchSockets } = createGateway();
    projectFindFirst.mockResolvedValue({ id: "project_1" });
    memberFindUnique.mockResolvedValue({ id: "member_1" });

    fetchSockets.mockResolvedValue([
      { data: { user: { id: "u1", name: "Alice", email: "a@b.com", image: null } } },
      {
        data: {
          user: { id: "u2", name: "Bob", email: "b@c.com", image: "https://cdn/bob.png" },
        },
      },
      // Missing name — defensive filter must exclude before Zod parse.
      { data: { user: { id: "u3", email: "c@d.com", image: null } } },
      // Missing email — same.
      { data: { user: { id: "u4", name: "Dave", image: null } } },
    ]);

    const { socket } = createPresenceSocket();
    await gateway.handleJoinProjectRoom(socket, { projectId: "project_1" });
    await Promise.resolve();

    const emittedPayload = emit.mock.calls.find(
      ([event]) => event === SOCKET_EVENTS.ROOM_PRESENCE_UPDATED,
    )?.[1] as { projectId: string; users: unknown[] } | undefined;

    expect(emittedPayload?.projectId).toBe("project_1");
    expect(emittedPayload?.users).toHaveLength(2);
    expect(emittedPayload?.users).toEqual(
      expect.arrayContaining([
        { id: "u1", name: "Alice", email: "a@b.com", image: null },
        { id: "u2", name: "Bob", email: "b@c.com", image: "https://cdn/bob.png" },
      ]),
    );
    // Gateway reference keeps TS happy and documents intent.
    expect(gateway).toBeInstanceOf(ProjectsGateway);
  });

  it("handles sockets without user data (mid-shutdown / stale) gracefully", async () => {
    const { gateway, projectFindFirst, memberFindUnique, emit, fetchSockets } = createGateway();
    projectFindFirst.mockResolvedValue({ id: "project_1" });
    memberFindUnique.mockResolvedValue({ id: "member_1" });

    fetchSockets.mockResolvedValue([
      { data: { user: { id: "u1", name: "Alice", email: "a@b.com", image: null } } },
      { data: {} }, // missing user — should be skipped
    ]);

    const { socket } = createPresenceSocket();
    await gateway.handleJoinProjectRoom(socket, { projectId: "project_1" });
    await Promise.resolve();

    const emittedPayload = emit.mock.calls.find(
      ([event]) => event === SOCKET_EVENTS.ROOM_PRESENCE_UPDATED,
    )?.[1] as { projectId: string; users: unknown[] } | undefined;

    expect(emittedPayload?.users).toHaveLength(1);
    expect(emittedPayload?.users[0]).toMatchObject({ id: "u1" });
  });

  it("broadcasts room presence on disconnecting (single user)", async () => {
    const { emit, fetchSockets, triggerConnection, gateway } = createGateway();
    fetchSockets.mockResolvedValue([]);

    // Build a socket that is in one project room and mock its disconnecting event.
    const { socket } = createPresenceSocket();
    (socket as unknown as { rooms: Set<string> }).rooms = new Set(["project:project_1"]);

    // Wire disconnecting manually — easier than mocking Socket.IO's event emitter.
    let disconnectingCb: (() => void) | undefined;
    const socketAsEmitter = {
      on: vi.fn((event: string, cb: () => void) => {
        if (event === "disconnecting") disconnectingCb = cb;
      }),
      data: socket.data,
      rooms: socket.rooms,
    };

    triggerConnection(socketAsEmitter);
    expect(disconnectingCb).toBeDefined();

    // Reset fetches/emits from the connection setup so we only see disconnect activity.
    emit.mockClear();
    fetchSockets.mockClear();

    disconnectingCb?.();
    await Promise.resolve();

    expect(fetchSockets).toHaveBeenCalledWith();
    expect(emit).toHaveBeenCalledWith(
      SOCKET_EVENTS.ROOM_PRESENCE_UPDATED,
      expect.objectContaining({ projectId: "project_1", users: [] }),
    );
    // Gateway reference prevents unused-var lint.
    expect(gateway).toBeInstanceOf(ProjectsGateway);
  });

  it("GET_ROOM_PRESENCE returns the current snapshot (with org + member checks)", async () => {
    const { gateway, projectFindFirst, memberFindUnique, emit, fetchSockets } = createGateway();
    fetchSockets.mockResolvedValue([
      { data: { user: { id: "u1", name: "Alice", email: "a@b.com", image: null } } },
      { data: { user: { id: "u2", name: "Bob", email: "b@c.com", image: null } } },
    ]);

    const { socket } = createPresenceSocket();

    // Valid project + member → returns presence snapshot (no broadcast, direct ack).
    projectFindFirst.mockResolvedValueOnce({ id: "project_1" });
    memberFindUnique.mockResolvedValueOnce({ id: "member_1" });
    await expect(
      gateway.handleGetRoomPresence(socket, { projectId: "project_1" }),
    ).resolves.toEqual({
      projectId: "project_1",
      users: [
        { id: "u1", name: "Alice", email: "a@b.com", image: null },
        { id: "u2", name: "Bob", email: "b@c.com", image: null },
      ],
    });
    expect(emit).not.toHaveBeenCalled();

    // Forbidden → not found.
    projectFindFirst.mockResolvedValueOnce(null);
    await expect(
      gateway.handleGetRoomPresence(socket, { projectId: "project_other" }),
    ).resolves.toEqual({ ok: false, error: "FORBIDDEN" });
  });
});

describe("ProjectsGateway user room auto-join", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("joins the user's private room on connection", () => {
    const { gateway } = createGateway();
    const { socket, join } = createPresenceSocket({ id: "user_1" });

    gateway.handleConnection(socket);

    expect(join).toHaveBeenCalledExactlyOnceWith("user:user_1");
  });

  it("skips joining when the socket has no authenticated user", () => {
    const { gateway } = createGateway();
    const join = vi.fn();
    const socket = { data: {}, join } as unknown as AuthenticatedSocket;

    gateway.handleConnection(socket);

    expect(join).not.toHaveBeenCalled();
  });
});
