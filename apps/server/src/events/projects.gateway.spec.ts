import type { PrismaClient } from "@repo/db";
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
  user: { id: string };
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

function createGateway() {
  const use = vi.fn();
  const attachServer = vi.fn();
  const projectFindFirst = vi.fn();
  const memberFindUnique = vi.fn();
  const prisma = {
    project: { findFirst: projectFindFirst },
    member: { findUnique: memberFindUnique },
  } as unknown as PrismaClient;

  const gateway = new ProjectsGateway({ attachServer } as unknown as EventsService, prisma);
  gateway.afterInit({ use } as unknown as GatewayServer);

  const middleware = use.mock.calls[0]?.[0] as unknown as ConnectionMiddleware;
  if (!middleware) {
    throw new Error("connection middleware was not registered");
  }

  return { gateway, middleware, attachServer, projectFindFirst, memberFindUnique };
}

function createRoomSocket(
  session: SessionResult["session"] = { id: "session_1", activeOrganizationId: "org_1" },
) {
  const join = vi.fn().mockResolvedValue(undefined);
  const leave = vi.fn().mockResolvedValue(undefined);
  const socket = {
    data: { user: { id: "user_1" }, session },
    join,
    leave,
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
    const { middleware, attachServer } = createGateway();
    const client: FakeSocket = { handshake: { headers: {} }, data: {} };
    const next = vi.fn();

    await middleware(client, next);

    expect(attachServer).toHaveBeenCalledTimes(1);
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
      user: { id: "user_1" },
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
    const { gateway, projectFindFirst, memberFindUnique } = createGateway();
    projectFindFirst.mockResolvedValue({ id: "project_1" });
    memberFindUnique.mockResolvedValue({ id: "member_1" });
    const { socket, join } = createRoomSocket();

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
  });

  it("refuses projects from another organization", async () => {
    const { gateway, projectFindFirst, memberFindUnique } = createGateway();
    projectFindFirst.mockResolvedValue(null);
    const { socket, join } = createRoomSocket();

    await expect(
      gateway.handleJoinProjectRoom(socket, { projectId: "project_other" }),
    ).resolves.toEqual({ ok: false, error: "FORBIDDEN" });

    expect(memberFindUnique).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
  });

  it("refuses users who are not members of the organization", async () => {
    const { gateway, projectFindFirst, memberFindUnique } = createGateway();
    projectFindFirst.mockResolvedValue({ id: "project_1" });
    memberFindUnique.mockResolvedValue(null);
    const { socket, join } = createRoomSocket();

    await expect(
      gateway.handleJoinProjectRoom(socket, { projectId: "project_1" }),
    ).resolves.toEqual({ ok: false, error: "FORBIDDEN" });

    expect(join).not.toHaveBeenCalled();
  });

  it("refuses to join without an active organization", async () => {
    const { gateway, projectFindFirst, memberFindUnique } = createGateway();
    const { socket, join } = createRoomSocket({ id: "session_1", activeOrganizationId: null });

    await expect(
      gateway.handleJoinProjectRoom(socket, { projectId: "project_1" }),
    ).resolves.toEqual({ ok: false, error: "NO_ACTIVE_ORGANIZATION" });

    expect(projectFindFirst).not.toHaveBeenCalled();
    expect(memberFindUnique).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
  });

  it("rejects malformed join payloads", async () => {
    const { gateway, projectFindFirst } = createGateway();
    const { socket, join } = createRoomSocket();

    await expect(gateway.handleJoinProjectRoom(socket, { projectId: "" })).resolves.toEqual({
      ok: false,
      error: "INVALID_PAYLOAD",
    });

    expect(projectFindFirst).not.toHaveBeenCalled();
    expect(join).not.toHaveBeenCalled();
  });

  it("leaves the project room", async () => {
    const { gateway, projectFindFirst } = createGateway();
    const { socket, leave } = createRoomSocket();

    await expect(
      gateway.handleLeaveProjectRoom(socket, { projectId: "project_1" }),
    ).resolves.toEqual({ ok: true, room: "project:project_1" });

    expect(leave).toHaveBeenCalledExactlyOnceWith("project:project_1");
    expect(projectFindFirst).not.toHaveBeenCalled();
  });
});
