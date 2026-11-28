import { Logger } from "@nestjs/common";
import type { PrismaClient } from "@repo/db";
import { updateOrganizationSchema } from "@repo/shared";
import { APIError } from "better-auth/api";
import type { OrganizationOptions } from "better-auth/plugins";

export interface WorkspaceOrganizationHookContext {
  context: {
    session: {
      session: { token: string; activeOrganizationId?: string | null };
      user: { id: string };
    } | null;
  };
}

const logger = new Logger("WorkspaceOrganizationHooks");

export function createWorkspaceOrganizationHooks(prisma: PrismaClient) {
  const deletionSnapshots = new WeakMap<
    object,
    { affectedUserIds: string[]; restoreCurrentSession: boolean }
  >();

  return {
    beforeUpdateOrganization: async ({
      organization,
      member,
    }: {
      organization: unknown;
      user?: unknown;
      member?: { organizationId: string };
    }) => {
      const result = updateOrganizationSchema.safeParse(organization);
      if (!result.success) {
        throw new APIError("BAD_REQUEST", {
          message: result.error.issues[0]?.message ?? "Invalid organization update",
        });
      }

      // BetterAuth checks the raw slug before this hook, so a slug with
      // surrounding whitespace can still be trimmed into another workspace's
      // slug and reach the database unique constraint. Re-check the normalized
      // value so the client gets the same field-level conflict error.
      if (result.data.slug) {
        const existing = await prisma.organization.findFirst({
          where: { slug: result.data.slug },
          select: { id: true },
        });
        if (existing && existing.id !== member?.organizationId) {
          throw APIError.from("BAD_REQUEST", {
            code: "ORGANIZATION_SLUG_ALREADY_TAKEN",
            message: "Organization slug already taken",
          });
        }
      }

      return { data: result.data };
    },
    beforeDeleteOrganization: async (
      { organization }: { organization: { id: string } },
      ctx?: WorkspaceOrganizationHookContext,
    ) => {
      if (!ctx) return;
      const members = await prisma.member.findMany({
        where: { organizationId: organization.id },
        select: { userId: true },
      });
      deletionSnapshots.set(ctx, {
        affectedUserIds: members.map((member) => member.userId),
        restoreCurrentSession:
          ctx.context.session?.session.activeOrganizationId === organization.id,
      });
    },
    afterDeleteOrganization: async (
      { organization }: { organization: { id: string } },
      ctx?: WorkspaceOrganizationHookContext,
    ) => {
      const snapshot = ctx ? deletionSnapshots.get(ctx) : undefined;
      const affectedUserIds = snapshot?.affectedUserIds ?? [];
      const restoreCurrentSession = snapshot?.restoreCurrentSession ?? false;
      if (ctx) deletionSnapshots.delete(ctx);
      const currentSessionToken = ctx?.context.session?.session.token;
      const currentUserId = ctx?.context.session?.user.id;

      try {
        await prisma.$transaction(async (tx) => {
          await tx.notification.deleteMany({
            where: { payload: { path: ["organizationId"], equals: organization.id } },
          });
          await tx.analyticsEvent.deleteMany({ where: { organizationId: organization.id } });

          for (const userId of affectedUserIds) {
            const nextMember = await tx.member.findFirst({
              where: { userId },
              orderBy: [{ createdAt: "asc" }, { organizationId: "asc" }],
              select: { organizationId: true },
            });
            const nextOrganizationId = nextMember?.organizationId ?? null;

            await tx.session.updateMany({
              where: { userId, activeOrganizationId: organization.id },
              data: { activeOrganizationId: nextOrganizationId },
            });
            if (restoreCurrentSession && userId === currentUserId && currentSessionToken) {
              // BetterAuth clears the deleting user's current session before
              // invoking this hook, so restore that session by token as well.
              await tx.session.updateMany({
                where: { token: currentSessionToken },
                data: { activeOrganizationId: nextOrganizationId },
              });
            }
            await tx.user.updateMany({
              where: { id: userId, lastActiveOrganizationId: organization.id },
              data: { lastActiveOrganizationId: nextOrganizationId },
            });
          }
        });
      } catch (error) {
        logger.error(
          `Organization ${organization.id} was deleted, but cleanup did not complete`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    },
  } satisfies NonNullable<OrganizationOptions["organizationHooks"]>;
}
