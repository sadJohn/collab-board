import type { ExecutionContext } from "@nestjs/common";
import { UnauthorizedException } from "@nestjs/common";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { auth } from "./auth";
import { type AuthenticatedRequest, AuthGuard } from "./auth.guard";

vi.mock("./auth", () => ({
  auth: { api: { getSession: vi.fn() } },
}));

/** Only the fields the guard touches need to exist in these fakes. */
interface SessionResult {
  user: { id: string };
  session: { id: string };
}

const getSession = vi.mocked(auth.api.getSession) as unknown as Mock<
  (args: { headers: Headers }) => Promise<SessionResult | null>
>;

/** `fromNodeHeaders` returns a Web `Headers` instance, not a plain object. */
function sentHeaders(): Headers {
  const call = getSession.mock.calls[0];
  if (!call) {
    throw new Error("getSession was not called");
  }
  return call[0].headers;
}

function createContext(headers: Record<string, string>): ExecutionContext {
  const request = { headers } as unknown as AuthenticatedRequest;
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe("AuthGuard", () => {
  beforeEach(() => {
    getSession.mockReset();
  });

  it("rejects requests without any headers and does not resolve a session", async () => {
    getSession.mockResolvedValue(null);
    const guard = new AuthGuard();

    await expect(guard.canActivate(createContext({}))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(getSession).toHaveBeenCalledTimes(1);
    expect(sentHeaders().get("cookie")).toBeNull();
  });

  it("rejects invalid or expired sessions", async () => {
    getSession.mockResolvedValue(null);
    const guard = new AuthGuard();

    await expect(
      guard.canActivate(createContext({ cookie: "better-auth.session_token=stale" })),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(sentHeaders().get("cookie")).toBe("better-auth.session_token=stale");
  });

  it("attaches the user and session for valid cookies", async () => {
    const result: SessionResult = { user: { id: "user_1" }, session: { id: "session_1" } };
    getSession.mockResolvedValue(result);
    const guard = new AuthGuard();
    const request = {
      headers: { cookie: "better-auth.session_token=fresh" },
    } as AuthenticatedRequest;
    const context = {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(result.user);
    expect(request.session).toEqual(result.session);
  });
});
