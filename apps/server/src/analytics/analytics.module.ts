import { Module } from "@nestjs/common";

import { AnalyticsController } from "./analytics.controller";
import { AnalyticsService } from "./analytics.service";

/**
 * Always-registered analytics surface. The BullMQ queue/processor live in the
 * separate `AnalyticsQueueModule`, which `AppModule` only imports when
 * `REDIS_URL` is configured; this module degrades to direct writes via the
 * producer when the queue is absent.
 */
@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
})
export class AnalyticsModule {}
