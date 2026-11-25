import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "./generated/prisma/client";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("缺少 DATABASE_URL 环境变量（Neon 连接池字符串），请检查根目录 .env");
}

// Prisma 7 requires an explicit driver adapter; Neon's driver handles pooling.
const adapter = new PrismaNeon({ connectionString });

const globalForPrisma = globalThis as unknown as {
  __collabBoardPrisma?: PrismaClient;
};

/**
 * Single PrismaClient instance.
 *
 * Next to the usual "avoid multiple clients in dev" guard, keeping the
 * instance on `globalThis` also survives Nest HMR module reloads.
 */
export const prisma: PrismaClient =
  globalForPrisma.__collabBoardPrisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__collabBoardPrisma = prisma;
}

export {
  type Account,
  type Comment,
  type Invitation,
  type Member,
  type Organization,
  Prisma,
  PrismaClient,
  type Project,
  type Session,
  type Task,
  type User,
  type Verification,
} from "./generated/prisma/client";
export { TaskPriority, TaskStatus } from "./generated/prisma/enums";
