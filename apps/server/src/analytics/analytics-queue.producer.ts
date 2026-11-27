import { Logger } from "@nestjs/common";
import { prisma } from "@repo/db";
import { Queue } from "bullmq";

import { createBullConnection } from "../redis/redis-connection";
import { isRedisEnabled } from "../redis/redis-url";
import {
  ANALYTICS_JOB_OPTIONS,
  ANALYTICS_QUEUE,
  type AnalyticsBatchJobData,
  type AnalyticsEventCreateInput,
  BATCH_INSERT_JOB,
} from "./analytics.constants";

/**
 * DI-free producer for the `analytics` queue.
 *
 * Mirrors `mail-queue.producer`: `AnalyticsController` lives inside the Nest
 * container and calls this singleton, which lazily creates a BullMQ `Queue`
 * (sharing `createBullConnection` with the Nest worker). When `REDIS_URL` is
 * empty it writes straight to Neon via `prisma.analyticsEvent.createMany`, so
 * local development and Redis-less deployments still persist events.
 */
class AnalyticsQueueProducer {
  private readonly logger = new Logger(AnalyticsQueueProducer.name);
  private queue: Queue<AnalyticsBatchJobData> | null = null;
  private connection: ReturnType<typeof createBullConnection> | null = null;

  /** Enqueues a batch, or writes it inline when Redis is disabled / down. */
  async enqueueBatch(events: AnalyticsEventCreateInput[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    if (!isRedisEnabled()) {
      await this.writeDirect(events);
      return;
    }

    try {
      const job = await this.getQueue().add(BATCH_INSERT_JOB, { events }, ANALYTICS_JOB_OPTIONS);
      this.logger.log(`埋点批次已入队：job ${job.id ?? "?"}，${events.length} 条`);
    } catch (error) {
      this.logger.error(`埋点入队失败，降级为直接写入：${(error as Error).message}`);
      await this.writeDirect(events);
    }
  }

  /** Closes the queue and its externally-owned ioredis connection on shutdown. */
  async close(): Promise<void> {
    const queue = this.queue;
    const connection = this.connection;
    this.queue = null;
    this.connection = null;

    if (queue) {
      try {
        await queue.close();
      } catch (error) {
        this.logger.warn(`关闭埋点队列失败：${(error as Error).message}`);
      }
    }

    if (!connection) {
      return;
    }

    try {
      await connection.quit();
    } catch (error) {
      this.logger.warn(`关闭埋点队列连接失败，执行强制断开：${(error as Error).message}`);
      connection.disconnect();
    }
  }

  private getQueue(): Queue<AnalyticsBatchJobData> {
    if (!this.queue) {
      // BullMQ does not own an externally provided connection, so keep the
      // reference here and quit it explicitly in `close()`.
      this.connection = createBullConnection();
      this.queue = new Queue<AnalyticsBatchJobData>(ANALYTICS_QUEUE, {
        connection: this.connection,
      });
    }
    return this.queue;
  }

  /** Synchronous-ish fallback write so ingestion never blocks on Redis. */
  private async writeDirect(events: AnalyticsEventCreateInput[]): Promise<void> {
    try {
      await prisma.analyticsEvent.createMany({ data: events });
      this.logger.log(`埋点批次直接写入成功：${events.length} 条`);
    } catch (error) {
      // Never let an analytics outage break the request that triggered it.
      this.logger.error(`埋点直接写入失败：${(error as Error).message}`);
    }
  }
}

export const analyticsQueueProducer = new AnalyticsQueueProducer();
