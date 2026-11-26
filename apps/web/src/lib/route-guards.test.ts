import { QueryClient } from "@tanstack/react-query";
import { isRedirect } from "@tanstack/react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { authClient } from "./auth-client";
import { redirectIfAuthenticated, requireSession } from "./route-guards";

vi.mock("./auth-client", () => ({
  authClient: { getSession: vi.fn() },
}));

type SessionResult = Awaited<ReturnType<typeof authClient.getSession>>;

const getSession = vi.mocked(authClient.getSession);

function createQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

async function capture(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

beforeEach(() => {
  getSession.mockReset();
});

describe("requireSession", () => {
  it("redirects anonymous visitors to /login and keeps the target href", async () => {
    getSession.mockResolvedValue({ data: null } as unknown as SessionResult);

    const error = await capture(requireSession(createQueryClient(), "/home?view=board"));

    expect(isRedirect(error)).toBe(true);
    if (isRedirect(error)) {
      expect(error.options.to).toBe("/login");
      expect(error.options.search).toEqual({ redirect: "/home?view=board" });
    }
  });

  it("resolves with the session for signed-in users", async () => {
    getSession.mockResolvedValue({
      data: { user: { id: "user-1" }, session: { id: "session-1" } },
    } as unknown as SessionResult);

    await expect(requireSession(createQueryClient(), "/home")).resolves.toMatchObject({
      user: { id: "user-1" },
    });
  });
});

describe("redirectIfAuthenticated", () => {
  it("sends signed-in users away from the auth pages", async () => {
    getSession.mockResolvedValue({
      data: { user: { id: "user-1" }, session: { id: "session-1" } },
    } as unknown as SessionResult);

    const error = await capture(redirectIfAuthenticated(createQueryClient()));

    expect(isRedirect(error)).toBe(true);
    if (isRedirect(error)) {
      expect(error.options.to).toBe("/home");
    }
  });

  it("lets anonymous visitors through", async () => {
    getSession.mockResolvedValue({ data: null } as unknown as SessionResult);

    await expect(redirectIfAuthenticated(createQueryClient())).resolves.toBeUndefined();
  });
});
