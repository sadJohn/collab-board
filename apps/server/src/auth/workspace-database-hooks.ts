import { randomUUID } from "node:crypto";

import { Logger } from "@nestjs/common";
import type { PrismaClient } from "@repo/db";

const logger = new Logger("WorkspaceDatabaseHooks");

export interface WorkspaceUser {
  id: string;
  name: string;
}

export interface WorkspaceSession {
  userId: string;
  activeOrganizationId?: string | null;
}

export function createWorkspaceDatabaseHooks(prisma: PrismaClient) {
  const explicitWorkspaceUpdates = new WeakMap<object, string | null>();

  return {
    user: {
      create: {
        after: async (user: WorkspaceUser) => {
          try {
            await prisma.$transaction(async (tx) => {
              const organizationId = randomUUID();
              await tx.organization.create({
                data: {
                  id: organizationId,
                  name: `${user.name || "Personal"}'s Workspace`,
                  slug: `workspace-${randomUUID().replaceAll("-", "").slice(0, 12)}`,
                },
              });
              await tx.member.create({
                data: {
                  id: randomUUID(),
                  organizationId,
                  userId: user.id,
                  role: "owner",
                },
              });
              await tx.user.update({
                where: { id: user.id },
                data: { lastActiveOrganizationId: organizationId },
              });
            });
          } catch (error) {
            logger.error(
              `Failed to initialize the default workspace for user ${user.id}`,
              error instanceof Error ? error.stack : String(error),
            );
          }
        },
      },
    },
    session: {
      create: {
        before: async <T extends WorkspaceSession>(session: T) => {
          const user = await prisma.user.findUnique({
            where: { id: session.userId },
            select: { lastActiveOrganizationId: true },
          });
          const rememberedOrganizationId = user?.lastActiveOrganizationId;

          if (rememberedOrganizationId) {
            const rememberedMember = await prisma.member.findUnique({
              where: {
                organizationId_userId: {
                  organizationId: rememberedOrganizationId,
                  userId: session.userId,
                },
              },
              select: { id: true },
            });

            if (rememberedMember) {
              return {
                data: { ...session, activeOrganizationId: rememberedOrganizationId },
              };
            }
          }

          const earliestMember = await prisma.member.findFirst({
            where: { userId: session.userId },
            orderBy: [{ createdAt: "asc" }, { organizationId: "asc" }],
            select: { organizationId: true },
          });
          const activeOrganizationId = earliestMember?.organizationId ?? null;

          await prisma.user.update({
            where: { id: session.userId },
            data: { lastActiveOrganizationId: activeOrganizationId },
          });

          return { data: { ...session, activeOrganizationId } };
        },
      },
      update: {
        before: async (
          session: { activeOrganizationId?: string | null } & Record<string, unknown>,
          context: object | null,
        ) => {
          if (context && "activeOrganizationId" in session) {
            explicitWorkspaceUpdates.set(context, session.activeOrganizationId ?? null);
          }
        },
        after: async (session: WorkspaceSession, context: object | null = null) => {
          let shouldPersist = true;
          if (context) {
            const explicitOrganizationId = explicitWorkspaceUpdates.get(context);
            explicitWorkspaceUpdates.delete(context);
            shouldPersist =
              explicitOrganizationId !== undefined &&
              explicitOrganizationId === session.activeOrganizationId;
          }

          if (!shouldPersist || !session.activeOrganizationId) {
            return;
          }

          await prisma.user.update({
            where: { id: session.userId },
            data: { lastActiveOrganizationId: session.activeOrganizationId },
          });
        },
      },
    },
  };
}
