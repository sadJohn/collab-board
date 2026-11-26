import { Global, Module } from "@nestjs/common";
import { prisma } from "@repo/db";

/** Injection token for the shared PrismaClient exported by `@repo/db`. */
export const PRISMA_CLIENT = Symbol("PRISMA_CLIENT");

/**
 * Exposes the single PrismaClient instance from `@repo/db` to the DI container.
 *
 * It is global because nearly every feature module needs database access and the
 * instance itself already lives on `globalThis` (see `packages/db`).
 */
@Global()
@Module({
  providers: [{ provide: PRISMA_CLIENT, useValue: prisma }],
  exports: [PRISMA_CLIENT],
})
export class PrismaModule {}
