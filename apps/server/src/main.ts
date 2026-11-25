import "reflect-metadata";
import "./env";
import { NestFactory } from "@nestjs/core";
import { NodeAdapter } from "@nestjs/platform-node";
import { toNodeHandler } from "better-auth/node";
import { AppModule } from "./app.module";
import { auth } from "./auth/auth";

async function bootstrap(): Promise<void> {
  // BetterAuth must read the raw request stream itself, so the global body
  // parser is disabled here and re-registered after the auth handler below.
  const app = await NestFactory.create(AppModule, new NodeAdapter(), { bodyParser: false });

  const corsOrigin = process.env.CORS_ORIGIN ?? "http://localhost:5173";
  app.enableCors({ origin: corsOrigin, credentials: true });

  app.use("/api/auth", toNodeHandler(auth));

  app.useBodyParser("json");
  app.useBodyParser("urlencoded");

  const port = Number(process.env.SERVER_PORT ?? 3000);
  await app.listen(port);
  console.log(`[server] listening on http://localhost:${port} (cors: ${corsOrigin})`);
}

void bootstrap();
