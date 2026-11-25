import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { NodeAdapter } from "@nestjs/platform-node";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, new NodeAdapter());
  const port = Number(process.env.SERVER_PORT ?? 3000);

  await app.listen(port);
  console.log(`[server] listening on http://localhost:${port}`);
}

void bootstrap();
