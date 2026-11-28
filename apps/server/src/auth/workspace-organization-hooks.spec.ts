import { Logger } from "@nestjs/common";
import type { PrismaClient } from "@repo/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceOrganizationHooks } from "./workspace-organization-hooks";

function createHooks(prisma = {} as PrismaClient) {
  return createWorkspaceOrganizationHooks(prisma);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workspace organization update hooks", () => {
  it("normalizes a partial organization update", async () => {
    const hooks = createHooks();

    await expect(
      hooks.beforeUpdateOrganization({ organization: { name: "  Acme  " } }),
    ).resolves.toEqual({ data: { name: "Acme" } });
  });

  it("rejects an empty organization update", async () => {
    const hooks = createHooks();

    await expect(hooks.beforeUpdateOrganization({ organization: {} })).rejects.toMatchObject({
      status: "BAD_REQUEST",
    });
  });

  it("rejects an invalid organization slug", async () => {
    const hooks = createHooks();

    await expect(
      hooks.beforeUpdateOrganization({ organization: { slug: "Acme Team" } }),
    ).rejects.toMatchObject({ status: "BAD_REQUEST" });
  });

  it("rejects a trimmed slug that another workspace already owns", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "org-other" });
    const hooks = createHooks({ organization: { findFirst } } as unknown as PrismaClient);

    await expect(
      hooks.beforeUpdateOrganization({
        organization: { slug: "  taken  " },
        user: { id: "user-1" },
        member: { organizationId: "org-current" },
      }),
    ).rejects.toMatchObject({
      status: "BAD_REQUEST",
      body: { code: "ORGANIZATION_SLUG_ALREADY_TAKEN" },
    });
    expect(findFirst).toHaveBeenCalledWith({ where: { slug: "taken" }, select: { id: true } });
  });

  it("allows saving the unchanged slug of the current workspace", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "org-current" });
    const hooks = createHooks({ organization: { findFirst } } as unknown as PrismaClient);

    await expect(
      hooks.beforeUpdateOrganization({
        organization: { slug: "acme" },
        user: { id: "user-1" },
        member: { organizationId: "org-current" },
      }),
    ).resolves.toEqual({ data: { slug: "acme" } });
  });

  it.each([{ logo: "https://example.com/logo.png" }, { metadata: { theme: "dark" } }])(
    "rejects unsupported organization field %o",
    async (field) => {
      const hooks = createHooks();

      await expect(
        hooks.beforeUpdateOrganization({ organization: { name: "Acme", ...field } }),
      ).rejects.toMatchObject({ status: "BAD_REQUEST" });
    },
  );
});

function createDeletionFixture(affectedUserIds: string[]) {
  const tx = {
    notification: { deleteMany: vi.fn() },
    analyticsEvent: { deleteMany: vi.fn() },
    member: { findFirst: vi.fn() },
    session: { updateMany: vi.fn() },
    user: { updateMany: vi.fn() },
  };
  const transaction = vi.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx));
  const findAffectedMembers = vi
    .fn()
    .mockResolvedValue(affectedUserIds.map((userId) => ({ userId })));
  const prisma = {
    member: { findMany: findAffectedMembers },
    $transaction: transaction,
  } as unknown as PrismaClient;
  const currentUserId = affectedUserIds[0] ?? "user-owner";
  const ctx = {
    context: {
      session: {
        session: { token: `session-${currentUserId}`, activeOrganizationId: "org-deleted" },
        user: { id: currentUserId },
      },
    },
  };

  return { prisma, tx, transaction, findAffectedMembers, ctx, currentUserId };
}

async function runDeletion(
  fixture: ReturnType<typeof createDeletionFixture>,
  organizationId = "org-deleted",
) {
  const hooks = createHooks(fixture.prisma);
  await hooks.beforeDeleteOrganization({ organization: { id: organizationId } }, fixture.ctx);
  await hooks.afterDeleteOrganization({ organization: { id: organizationId } }, fixture.ctx);
}

describe("workspace organization deletion hooks", () => {
  it("deletes only notifications and analytics belonging to the organization", async () => {
    const fixture = createDeletionFixture([]);

    await runDeletion(fixture);

    expect(fixture.tx.notification.deleteMany).toHaveBeenCalledWith({
      where: { payload: { path: ["organizationId"], equals: "org-deleted" } },
    });
    expect(fixture.tx.analyticsEvent.deleteMany).toHaveBeenCalledWith({
      where: { organizationId: "org-deleted" },
    });
  });

  it("restores affected sessions and remembered workspaces to the earliest remaining workspace", async () => {
    const fixture = createDeletionFixture(["user-owner", "user-peer"]);
    fixture.tx.member.findFirst.mockImplementation(({ where }) =>
      Promise.resolve({
        organizationId: where.userId === "user-owner" ? "org-a" : "org-z",
      }),
    );

    await runDeletion(fixture);

    expect(fixture.tx.member.findFirst).toHaveBeenCalledWith({
      where: { userId: "user-owner" },
      orderBy: [{ createdAt: "asc" }, { organizationId: "asc" }],
      select: { organizationId: true },
    });
    expect(fixture.tx.session.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-peer", activeOrganizationId: "org-deleted" },
      data: { activeOrganizationId: "org-z" },
    });
    expect(fixture.tx.session.updateMany).toHaveBeenCalledWith({
      where: { token: "session-user-owner" },
      data: { activeOrganizationId: "org-a" },
    });
    expect(fixture.tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-owner", lastActiveOrganizationId: "org-deleted" },
      data: { lastActiveOrganizationId: "org-a" },
    });
    expect(fixture.tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-peer", lastActiveOrganizationId: "org-deleted" },
      data: { lastActiveOrganizationId: "org-z" },
    });
  });

  it("does not replace the current session when deleting a non-active workspace", async () => {
    const fixture = createDeletionFixture(["user-owner"]);
    fixture.ctx.context.session.session.activeOrganizationId = "org-current";

    await runDeletion(fixture);

    expect(fixture.tx.session.updateMany).toHaveBeenCalledTimes(1);
    expect(fixture.tx.session.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-owner", activeOrganizationId: "org-deleted" },
      data: { activeOrganizationId: null },
    });
    expect(fixture.tx.session.updateMany).not.toHaveBeenCalledWith({
      where: { token: "session-user-owner" },
      data: { activeOrganizationId: null },
    });
  });

  it("clears deleted workspace references when no workspace remains", async () => {
    const fixture = createDeletionFixture(["user-owner"]);
    fixture.tx.member.findFirst.mockResolvedValue(null);

    await runDeletion(fixture);

    expect(fixture.tx.session.updateMany).toHaveBeenCalledWith({
      where: { userId: "user-owner", activeOrganizationId: "org-deleted" },
      data: { activeOrganizationId: null },
    });
    expect(fixture.tx.session.updateMany).toHaveBeenCalledWith({
      where: { token: "session-user-owner" },
      data: { activeOrganizationId: null },
    });
    expect(fixture.tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-owner", lastActiveOrganizationId: "org-deleted" },
      data: { lastActiveOrganizationId: null },
    });
  });

  it("keeps concurrent deletion snapshots isolated", async () => {
    const tx = {
      notification: { deleteMany: vi.fn() },
      analyticsEvent: { deleteMany: vi.fn() },
      member: { findFirst: vi.fn() },
      session: { updateMany: vi.fn() },
      user: { updateMany: vi.fn() },
    };
    const findMany = vi.fn(({ where }) =>
      Promise.resolve([{ userId: where.organizationId === "org-a" ? "user-a" : "user-b" }]),
    );
    const prisma = {
      member: { findMany },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
    } as unknown as PrismaClient;
    const hooks = createHooks(prisma);
    const ctxA = { context: { session: null } };
    const ctxB = { context: { session: null } };
    tx.member.findFirst.mockImplementation(({ where }) =>
      Promise.resolve({ organizationId: where.userId === "user-a" ? "org-a-next" : "org-b-next" }),
    );

    await hooks.beforeDeleteOrganization({ organization: { id: "org-a" } }, ctxA);
    await hooks.beforeDeleteOrganization({ organization: { id: "org-b" } }, ctxB);
    await hooks.afterDeleteOrganization({ organization: { id: "org-b" } }, ctxB);
    await hooks.afterDeleteOrganization({ organization: { id: "org-a" } }, ctxA);

    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-a", lastActiveOrganizationId: "org-a" },
      data: { lastActiveOrganizationId: "org-a-next" },
    });
    expect(tx.user.updateMany).toHaveBeenCalledWith({
      where: { id: "user-b", lastActiveOrganizationId: "org-b" },
      data: { lastActiveOrganizationId: "org-b-next" },
    });
  });

  it("logs cleanup failures without reporting the completed deletion as failed", async () => {
    const fixture = createDeletionFixture(["user-owner"]);
    fixture.transaction.mockRejectedValue(new Error("database unavailable"));
    const logError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    await expect(runDeletion(fixture)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(1);
  });
});
