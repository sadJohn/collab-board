import { resolve } from "node:path";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// The Prisma CLI always runs from `packages/db` (see package.json scripts) and
// all apps share the single `.env` file at the repository root.
config({ path: resolve(process.cwd(), "../../.env") });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // The Prisma CLI (migrate / db push / studio) talks to Neon directly,
    // bypassing PgBouncer. The app itself uses DATABASE_URL via the adapter.
    url: env("DIRECT_URL"),
  },
});

