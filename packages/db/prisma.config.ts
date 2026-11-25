import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { defineConfig, env } from "prisma/config";

// All apps share the single `.env` file at the repository root.
config({ path: fileURLToPath(new URL("../../.env", import.meta.url)) });

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
