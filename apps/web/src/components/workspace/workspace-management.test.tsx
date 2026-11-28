import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { useActiveOrganization, useSession } from "@/lib/auth-client";
import i18n from "@/locales/i18n";
import { WorkspaceDangerZone, WorkspaceEditButton } from "./workspace-management";

vi.mock("@/lib/auth-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth-client")>();
  return {
    ...actual,
    useSession: vi.fn(),
    useActiveOrganization: vi.fn(),
  };
});

const organization = { id: "org-1", name: "Acme", slug: "acme" };

function renderEditButton(currentOrganization = organization) {
  const onUpdated = vi.fn().mockResolvedValue(undefined);
  render(<WorkspaceEditButton organization={currentOrganization} onUpdated={onUpdated} />);
}

function renderDangerZone(currentOrganization = organization) {
  const onReconcile = vi.fn().mockResolvedValue(true);
  render(<WorkspaceDangerZone organization={currentOrganization} onReconcile={onReconcile} />);
}

function mockRole(role: string | undefined) {
  vi.mocked(useSession).mockReturnValue({
    data: { user: { id: "user-1" }, session: { activeOrganizationId: "org-1" } },
    isPending: false,
  } as unknown as ReturnType<typeof useSession>);
  vi.mocked(useActiveOrganization).mockReturnValue({
    data: {
      id: "org-1",
      members: role ? [{ userId: "user-1", role }] : [],
    },
    error: null,
    isPending: false,
    refetch: vi.fn(),
  } as unknown as ReturnType<typeof useActiveOrganization>);
}

beforeAll(async () => {
  await i18n.changeLanguage("en-US");
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("WorkspaceEditButton permissions", () => {
  it.each(["owner", "admin", "member, admin"])("shows the edit icon for %s", async (role) => {
    mockRole(role);

    await renderEditButton();

    expect(screen.getByRole("button", { name: "Edit workspace" })).toBeTruthy();
    expect(screen.queryByText("Workspace settings")).toBeNull();
  });

  it.each(["member", "unknown"])("hides the edit icon for %s", async (role) => {
    mockRole(role);

    await renderEditButton();

    expect(screen.queryByRole("button", { name: "Edit workspace" })).toBeNull();
  });

  it("fails closed when the current member cannot be found", async () => {
    mockRole(undefined);

    await renderEditButton();

    expect(screen.queryByRole("button", { name: "Edit workspace" })).toBeNull();
  });

  it("fails closed while the previous organization role is still hydrated", async () => {
    mockRole("owner");

    await renderEditButton({ id: "org-2", name: "Beta", slug: "beta" });

    expect(screen.queryByRole("button", { name: "Edit workspace" })).toBeNull();
  });
});

describe("WorkspaceDangerZone permissions", () => {
  it("shows the danger zone only to an owner", async () => {
    mockRole("owner");

    await renderDangerZone();

    expect(screen.getByText("Danger zone")).toBeTruthy();
  });

  it.each(["admin", "member"])("hides the danger zone from %s", async (role) => {
    mockRole(role);

    await renderDangerZone();

    expect(screen.queryByText("Danger zone")).toBeNull();
  });

  it("fails closed while the previous organization role is still hydrated", async () => {
    mockRole("owner");

    await renderDangerZone({ id: "org-2", name: "Beta", slug: "beta" });

    expect(screen.queryByText("Danger zone")).toBeNull();
  });
});
