import "reflect-metadata";
import path from "node:path";
import { NestFactory } from "@nestjs/core";
import { NodeAdapter } from "@nestjs/platform-node";
import { config } from "dotenv";
import { AppModule } from "./app.module";

/** The monorepo keeps a single `.env` at the repository root. */
const envPath = path.resolve(__dirname, "../../../.env");
const { parsed, error } = config({ path: envPath, quiet: true });

if (error) {
  console.warn(`[server] 未找到 ${envPath}，仅使用进程环境变量`);
} else {
  console.log(`[server] 已加载 ${Object.keys(parsed ?? {}).length} 个变量：${envPath}`);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new NodeAdapter());

  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
  app.enableCors({ origin: corsOrigin, credentials: true });

  const port = Number(process.env.SERVER_PORT ?? 3000);
  await app.listen(port);
  console.log(`[server] listening on http://localhost:${port} (cors: ${corsOrigin})`);
}

void bootstrap();
