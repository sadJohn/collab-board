import { Logger } from "@nestjs/common";
import type { PrismaClient } from "@repo/db";
import { afterEach, describe, expect, it, vi } from "vitest";

import { createWorkspaceDatabaseHooks } from "./workspace-database-hooks";

const user = { id: "user-1", name: "Ada" };

function createInitializationFixture() {
  const tx = {
    organization: { create: vi.fn() },
    member: { create: vi.fn() },
    user: { update: vi.fn() },
  };
  const transaction = vi.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx));
  const prisma = { $transaction: transaction } as unknown as PrismaClient;

  return { prisma, transaction, tx };
}

function createRestoreFixture() {
  const findUser = vi.fn();
  const updateUser = vi.fn();
  const findRememberedMember = vi.fn();
  const findEarliestMember = vi.fn();
  const prisma = {
    user: { findUnique: findUser, update: updateUser },
    member: { findUnique: findRememberedMember, findFirst: findEarliestMember },
  } as unknown as PrismaClient;

  return { prisma, findUser, updateUser, findRememberedMember, findEarliestMember };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("workspace database hooks", () => {
  it("creates the default workspace, owner membership and remembered workspace in one transaction", async () => {
    const { prisma, transaction, tx } = createInitializationFixture();
    const hooks = createWorkspaceDatabaseHooks(prisma);

    await hooks.user.create.after(user);

    expect(transaction).toHaveBeenCalledTimes(1);
    expect(tx.organization.create).toHaveBeenCalledTimes(1);
    const organizationData = tx.organization.create.mock.calls[0]?.[0].data;
    expect(organizationData).toMatchObject({
      id: expect.any(String),
      name: "Ada's Workspace",
      slug: expect.stringMatching(/^workspace-[a-f0-9]{12}$/),
    });
    expect(organizationData?.id).toBeTruthy();
    expect(tx.member.create).toHaveBeenCalledWith({
      data: {
        id: expect.any(String),
        organizationId: organizationData?.id,
        userId: user.id,
        role: "owner",
      },
    });
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { lastActiveOrganizationId: organizationData?.id },
    });
  });

  it("logs initialization failures without rejecting user creation", async () => {
    const { prisma, transaction } = createInitializationFixture();
    transaction.mockRejectedValue(new Error("database unavailable"));
    const logError = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const hooks = createWorkspaceDatabaseHooks(prisma);

    await expect(hooks.user.create.after(user)).resolves.toBeUndefined();
    expect(logError).toHaveBeenCalledTimes(1);
  });

  it("restores a remembered workspace when the user is still a member", async () => {
    const fixture = createRestoreFixture();
    fixture.findUser.mockResolvedValue({ lastActiveOrganizationId: "org-b" });
    fixture.findRememberedMember.mockResolvedValue({ id: "member-b" });
    const hooks = createWorkspaceDatabaseHooks(fixture.prisma);
    const session = { id: "session-1", userId: user.id, activeOrganizationId: null };

    await expect(hooks.session.create.before(session)).resolves.toEqual({
      data: { ...session, activeOrganizationId: "org-b" },
    });
    expect(fixture.findRememberedMember).toHaveBeenCalledWith({
      where: { organizationId_userId: { organizationId: "org-b", userId: user.id } },
      select: { id: true },
    });
    expect(fixture.findEarliestMember).not.toHaveBeenCalled();
    expect(fixture.updateUser).not.toHaveBeenCalled();
  });

  it("falls back to the earliest membership and rewrites an invalid remembered workspace", async () => {
    const fixture = createRestoreFixture();
    fixture.findUser.mockResolvedValue({ lastActiveOrganizationId: "org-b" });
    fixture.findRememberedMember.mockResolvedValue(null);
    fixture.findEarliestMember.mockResolvedValue({ organizationId: "org-a" });
    const hooks = createWorkspaceDatabaseHooks(fixture.prisma);
    const session = { id: "session-1", userId: user.id, activeOrganizationId: null };

    await expect(hooks.session.create.before(session)).resolves.toEqual({
      data: { ...session, activeOrganizationId: "org-a" },
    });
    expect(fixture.findEarliestMember).toHaveBeenCalledWith({
      where: { userId: user.id },
      orderBy: [{ createdAt: "asc" }, { organizationId: "asc" }],
      select: { organizationId: true },
    });
    expect(fixture.updateUser).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { lastActiveOrganizationId: "org-a" },
    });
  });

  it("clears the remembered and session workspace when no memberships remain", async () => {
    const fixture = createRestoreFixture();
    fixture.findUser.mockResolvedValue({ lastActiveOrganizationId: "org-b" });
    fixture.findRememberedMember.mockResolvedValue(null);
    fixture.findEarliestMember.mockResolvedValue(null);
    const hooks = createWorkspaceDatabaseHooks(fixture.prisma);
    const session = { id: "session-1", userId: user.id, activeOrganizationId: "org-b" };

    await expect(hooks.session.create.before(session)).resolves.toEqual({
      data: { ...session, activeOrganizationId: null },
    });
    expect(fixture.updateUser).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { lastActiveOrganizationId: null },
    });
  });

  it("remembers a non-empty active workspace after a session update", async () => {
    const fixture = createRestoreFixture();
    const hooks = createWorkspaceDatabaseHooks(fixture.prisma);

    await hooks.session.update.after({ userId: user.id, activeOrganizationId: "org-b" });

    expect(fixture.updateUser).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { lastActiveOrganizationId: "org-b" },
    });
  });

  it("persists explicit workspace changes but ignores renewal-only session updates", async () => {
    const fixture = createRestoreFixture();
    const hooks = createWorkspaceDatabaseHooks(fixture.prisma);
    const switchContext = {};
    const renewalContext = {};

    await hooks.session.update.before?.({ activeOrganizationId: "org-b" }, switchContext);
    await hooks.session.update.after(
      { userId: user.id, activeOrganizationId: "org-b" },
      switchContext,
    );
    await hooks.session.update.before?.({ expiresAt: new Date() }, renewalContext);
    await hooks.session.update.after(
      { userId: user.id, activeOrganizationId: "org-a" },
      renewalContext,
    );

    expect(fixture.updateUser).toHaveBeenCalledTimes(1);
    expect(fixture.updateUser).toHaveBeenCalledWith({
      where: { id: user.id },
      data: { lastActiveOrganizationId: "org-b" },
    });
  });

  it("does not overwrite the remembered workspace for an empty session update", async () => {
    const fixture = createRestoreFixture();
    const hooks = createWorkspaceDatabaseHooks(fixture.prisma);

    await hooks.session.update.after({ userId: user.id, activeOrganizationId: null });

    expect(fixture.updateUser).not.toHaveBeenCalled();
  });
});
