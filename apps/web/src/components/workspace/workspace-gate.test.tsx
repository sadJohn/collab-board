import { fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { authClient, useListOrganizations, useSession } from "@/lib/auth-client";
import i18n from "@/locales/i18n";
import { useWorkspaceActivation, WorkspaceGate } from "./workspace-gate";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    organization: {
      create: vi.fn(),
      setActive: vi.fn(),
    },
  },
  useSession: vi.fn(),
  useListOrganizations: vi.fn(),
}));

type SessionState = ReturnType<typeof useSession>;
type OrganizationsState = ReturnType<typeof useListOrganizations>;
type SetActiveResult = Awaited<ReturnType<typeof authClient.organization.setActive>>;

const useSessionMock = vi.mocked(useSession);
const useListOrganizationsMock = vi.mocked(useListOrganizations);
const setActive = vi.mocked(authClient.organization.setActive);

function sessionState(
  activeOrganizationId: string | null = null,
  overrides: Partial<SessionState> = {},
): SessionState {
  return {
    data: {
      session: { id: "session-1", activeOrganizationId },
      user: { id: "user-1" },
    },
    error: null,
    isPending: false,
    isRefetching: false,
    refetch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as SessionState;
}

function organizationsState(
  organizationIds: string[] = ["org-a"],
  overrides: Partial<OrganizationsState> = {},
): OrganizationsState {
  return {
    data: organizationIds.map((id) => ({
      id,
      name: id,
      slug: id,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    })),
    error: null,
    isPending: false,
    isRefetching: false,
    refetch: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as OrganizationsState;
}

beforeAll(async () => {
  await i18n.changeLanguage("en-US");
});

beforeEach(() => {
  useSessionMock.mockReset();
  useListOrganizationsMock.mockReset();
  setActive.mockReset();
});

describe("workspace activation fallback", () => {
  it("does not activate while session or organization data is still loading", () => {
    useSessionMock.mockReturnValue(sessionState(null, { data: null, isPending: true }));
    useListOrganizationsMock.mockReturnValue(organizationsState());
    const { rerender } = renderHook(() => useWorkspaceActivation());

    expect(setActive).not.toHaveBeenCalled();

    useSessionMock.mockReturnValue(sessionState());
    useListOrganizationsMock.mockReturnValue(
      organizationsState([], { data: null, isPending: true }),
    );
    rerender();

    expect(setActive).not.toHaveBeenCalled();
  });

  it("does not activate from stale data when either request has failed", () => {
    useSessionMock.mockReturnValue(
      sessionState(null, {
        error: new Error("session failed") as unknown as SessionState["error"],
      }),
    );
    useListOrganizationsMock.mockReturnValue(organizationsState());
    const { rerender } = renderHook(() => useWorkspaceActivation());

    expect(setActive).not.toHaveBeenCalled();

    useSessionMock.mockReturnValue(sessionState());
    useListOrganizationsMock.mockReturnValue(
      organizationsState(["org-a"], {
        error: new Error("list failed") as unknown as OrganizationsState["error"],
      }),
    );
    rerender();

    expect(setActive).not.toHaveBeenCalled();
  });

  it("keeps the workspace restored by the backend instead of selecting the first one", () => {
    useSessionMock.mockReturnValue(sessionState("org-b"));
    useListOrganizationsMock.mockReturnValue(organizationsState(["org-a", "org-b"]));

    renderHook(() => useWorkspaceActivation());

    expect(setActive).not.toHaveBeenCalled();
  });

  it("shows the create workspace flow only after an empty list loads successfully", () => {
    useSessionMock.mockReturnValue(sessionState());
    useListOrganizationsMock.mockReturnValue(organizationsState([]));

    render(
      <WorkspaceGate>
        <p>Protected content</p>
      </WorkspaceGate>,
    );

    expect(screen.getByRole("heading", { name: "Create workspace" })).toBeTruthy();
    expect(screen.queryByText("Protected content")).toBeNull();
    expect(setActive).not.toHaveBeenCalled();
  });

  it("does not start a second activation when loading state changes during a request", async () => {
    useSessionMock.mockReturnValue(sessionState());
    useListOrganizationsMock.mockReturnValue(organizationsState());
    setActive.mockReturnValue(new Promise(() => undefined));
    const { rerender } = renderHook(() => useWorkspaceActivation());

    await waitFor(() => expect(setActive).toHaveBeenCalledTimes(1));

    useListOrganizationsMock.mockReturnValue(organizationsState(["org-a"], { isRefetching: true }));
    rerender();
    useListOrganizationsMock.mockReturnValue(organizationsState());
    rerender();

    expect(setActive).toHaveBeenCalledTimes(1);
  });

  it("disables retry while an activation attempt is still in flight", async () => {
    useSessionMock.mockReturnValue(sessionState());
    useListOrganizationsMock.mockReturnValue(organizationsState());
    setActive
      .mockResolvedValueOnce({
        data: null,
        error: { message: "Activation unavailable" },
      } as unknown as SetActiveResult)
      .mockReturnValueOnce(new Promise(() => undefined));

    render(<WorkspaceGate />);
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(setActive).toHaveBeenCalledTimes(2));

    const retryButton = screen.getByRole("button", { name: "Retry" });
    expect(retryButton).toHaveProperty("disabled", true);
    fireEvent.click(retryButton);

    expect(setActive).toHaveBeenCalledTimes(2);
  });

  it("shows activation failures and retries only when requested", async () => {
    useSessionMock.mockReturnValue(sessionState());
    useListOrganizationsMock.mockReturnValue(organizationsState());
    setActive.mockResolvedValue({
      data: null,
      error: { message: "Activation unavailable" },
    } as unknown as SetActiveResult);

    render(<WorkspaceGate />);

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("Activation unavailable");
    });
    expect(setActive).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    await waitFor(() => expect(setActive).toHaveBeenCalledTimes(2));
  });
});
