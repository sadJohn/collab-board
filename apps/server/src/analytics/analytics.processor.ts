import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Inject, Logger } from "@nestjs/common";
import type { PrismaClient } from "@repo/db";
import type { Job } from "bullmq";

import { PRISMA_CLIENT } from "../prisma/prisma.module";
import { ANALYTICS_QUEUE, type AnalyticsBatchJobData } from "./analytics.constants";

/**
 * Background consumer for the `analytics` queue.
 *
 * Batches are inserted with a single `createMany` call. A Neon outage makes
 * `createMany` reject, which lets BullMQ honor the job's retry policy (3
 * attempts, exponential backoff) instead of silently dropping the batch.
 */
@Processor(ANALYTICS_QUEUE)
export class AnalyticsProcessor extends WorkerHost {
  private readonly logger = new Logger(AnalyticsProcessor.name);

  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {
    super();
  }

  override async process(job: Job<AnalyticsBatchJobData>): Promise<void> {
    const { events } = job.data;

    if (events.length === 0) {
      return;
    }

    this.logger.log(
      `消费埋点批次 ${job.id ?? "?"}（第 ${job.attemptsMade + 1} 次尝试），${events.length} 条`,
    );

    await this.prisma.analyticsEvent.createMany({ data: events });

    this.logger.log(`埋点批次 ${job.id ?? "?"} 写入成功`);
  }
}
