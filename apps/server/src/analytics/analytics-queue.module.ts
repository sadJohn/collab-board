import { BullModule } from "@nestjs/bullmq";
import { Logger, Module, type OnModuleDestroy } from "@nestjs/common";

import { ANALYTICS_QUEUE } from "./analytics.constants";
import { AnalyticsProcessor } from "./analytics.processor";
import { analyticsQueueProducer } from "./analytics-queue.producer";

/**
 * Only imported by `AppModule` when `REDIS_URL` is configured, so BullMQ never
 * forces a Redis connection for installations that do not want one. The
 * controller/service in `AnalyticsModule` stay registered regardless and
 * degrade to a direct `createMany` write via the producer.
 */
@Module({
  imports: [BullModule.registerQueue({ name: ANALYTICS_QUEUE })],
  providers: [AnalyticsProcessor],
})
export class AnalyticsQueueModule implements OnModuleDestroy {
  private readonly logger = new Logger(AnalyticsQueueModule.name);

  async onModuleDestroy(): Promise<void> {
    await analyticsQueueProducer.close();
    this.logger.log("埋点队列生产者已关闭");
  }
}
