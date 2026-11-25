import type { ExecutionContext } from "@nestjs/common";
import { ForbiddenException } from "@nestjs/common";
import { prisma } from "@repo/db";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { AuthSession, AuthUser } from "./auth.guard";
import { OrganizationGuard, type OrganizationRequest } from "./organization.guard";

vi.mock("@repo/db", () => ({
  prisma: { member: { findUnique: vi.fn() } },
}));

// The guard selects only `role`, so mirror the narrowed result type here.
const findMember = vi.mocked(prisma.member.findUnique) as unknown as Mock<
  () => Promise<{ role: string } | null>
>;

function createContext(request: Pick<OrganizationRequest, "user" | "session">): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

function createRequest(activeOrganizationId: string | null): OrganizationRequest {
  return {
    headers: {},
    user: { id: "user_1" } as AuthUser,
    session: { activeOrganizationId } as AuthSession,
  } as OrganizationRequest;
}

describe("OrganizationGuard", () => {
  beforeEach(() => {
    findMember.mockReset();
  });

  it("rejects requests without an active organization", async () => {
    const guard = new OrganizationGuard();

    await expect(guard.canActivate(createContext(createRequest(null)))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findMember).not.toHaveBeenCalled();
  });

  it("rejects users that are not members of the active organization", async () => {
    findMember.mockResolvedValue(null);
    const guard = new OrganizationGuard();
    const request = createRequest("org_1");

    await expect(guard.canActivate(createContext(request))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findMember).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: "org_1", userId: "user_1" } },
      select: { role: true },
    });
  });

  it("attaches the organization and role for members", async () => {
    findMember.mockResolvedValue({ role: "owner" });
    const guard = new OrganizationGuard();
    const request = createRequest("org_1");

    await expect(guard.canActivate(createContext(request))).resolves.toBe(true);
    expect(request.organizationId).toBe("org_1");
    expect(request.memberRole).toBe("owner");
  });
});
