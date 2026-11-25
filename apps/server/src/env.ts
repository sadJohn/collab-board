import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";

/**
 * The monorepo keeps a single `.env` at the repository root, so walk up from
 * the current directory until it is found. Works both from `apps/server`
 * (`nest start`, Vitest) and from the repository root (`node dist/main.js`).
 */
function findEnvFile(start: string): string | undefined {
  let dir = start;

  for (;;) {
    const candidate = path.join(dir, ".env");
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(dir);
    if (parent === dir) {
      return undefined;
    }
    dir = parent;
  }
}

export const envPath = findEnvFile(process.cwd());

if (!envPath) {
  console.warn("[server] 未找到 .env，仅使用进程环境变量");
} else {
  const { parsed, error } = config({ path: envPath, quiet: true });
  if (error) {
    console.warn(`[server] 读取 ${envPath} 失败，仅使用进程环境变量`);
  } else {
    console.log(`[server] 已加载 ${Object.keys(parsed ?? {}).length} 个变量：${envPath}`);
  }
}
