import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { auth } from "../auth/auth";
import type { EventsService } from "./events.service";
import { type GatewayServer, ProjectsGateway } from "./projects.gateway";

vi.mock("../auth/auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

interface SessionResult {
  user: { id: string };
  session: { id: string };
}

const getSession = vi.mocked(auth.api.getSession) as unknown as Mock<
  (args: { headers: Headers }) => Promise<SessionResult | null>
>;

interface FakeSocket {
  handshake: { headers: Record<string, string> };
  data: { user?: SessionResult["user"] };
}

type ConnectionMiddleware = (socket: FakeSocket, next: (error?: Error) => void) => Promise<void>;

function setup(): { middleware: ConnectionMiddleware; socket: () => FakeSocket } {
  const use = vi.fn();
  const attachServer = vi.fn();
  const gateway = new ProjectsGateway({ attachServer } as unknown as EventsService);

  gateway.afterInit({ use } as unknown as GatewayServer);

  expect(attachServer).toHaveBeenCalledTimes(1);

  const middleware = use.mock.calls[0]?.[0] as unknown as ConnectionMiddleware;
  if (!middleware) {
    throw new Error("connection middleware was not registered");
  }

  return {
    middleware,
    socket: () => ({ handshake: { headers: {} }, data: {} }),
  };
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
    const { middleware, socket } = setup();
    const client = socket();
    const next = vi.fn();

    await middleware(client, next);

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0]?.[0];
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toBe("Unauthorized");
    expect(client.data.user).toBeUndefined();
    expect(sentHeaders().get("cookie")).toBeNull();
  });

  it("rejects invalid or expired sessions", async () => {
    getSession.mockResolvedValue(null);
    const { middleware, socket } = setup();
    const client = socket();
    client.handshake.headers = { cookie: "better-auth.session_token=stale" };
    const next = vi.fn();

    await middleware(client, next);

    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(client.data.user).toBeUndefined();
    expect(sentHeaders().get("cookie")).toBe("better-auth.session_token=stale");
  });

  it("accepts a valid session and stores the user on the socket", async () => {
    const result: SessionResult = { user: { id: "user_1" }, session: { id: "session_1" } };
    getSession.mockResolvedValue(result);
    const { middleware, socket } = setup();
    const client = socket();
    client.handshake.headers = { cookie: "better-auth.session_token=fresh" };
    const next = vi.fn();

    await middleware(client, next);

    expect(next).toHaveBeenCalledExactlyOnceWith();
    expect(client.data.user).toEqual(result.user);
    expect(sentHeaders().get("cookie")).toBe("better-auth.session_token=fresh");
  });
});
