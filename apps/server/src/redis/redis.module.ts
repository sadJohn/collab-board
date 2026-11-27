import { Global, Module } from "@nestjs/common";
import { RedisService } from "./redis.service";

/**
 * Global so the dashboard cache, task/project invalidation and any future
 * consumer can inject `RedisService` without importing this module explicitly
 * (mirroring `PrismaModule`).
 */
@Global()
@Module({
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
