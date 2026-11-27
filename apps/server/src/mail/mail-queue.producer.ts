import { Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { createBullConnection } from "../redis/redis-connection";
import { isRedisEnabled } from "../redis/redis-url";
import { MailService } from "./mail.service";
import {
  MAIL_JOB_OPTIONS,
  MAIL_QUEUE,
  SEND_INVITATION_JOB,
  type SendInvitationJobData,
} from "./mail-queue.constants";

/**
 * DI-free singleton used by the BetterAuth `sendInvitationEmail` hook.
 *
 * Why not a Nest provider: `apps/server/src/auth/auth.ts` builds the BetterAuth
 * instance at module load time, outside the Nest container, so it cannot inject
 * `MailService` / `Queue`. This producer lazily creates its BullMQ `Queue`
 * (sharing `createBullConnection` with the Nest worker) and falls back to a
 * direct `MailService` call when `REDIS_URL` is empty — keeping Phase 8's
 * behavior intact for local development.
 */
class MailQueueProducer {
  private readonly logger = new Logger(MailQueueProducer.name);
  private readonly mailService = new MailService();
  private queue: Queue<SendInvitationJobData> | null = null;
  private connection: ReturnType<typeof createBullConnection> | null = null;

  /** Enqueues the invitation email, or sends it inline when Redis is disabled. */
  async enqueueInvitation(input: SendInvitationJobData): Promise<void> {
    if (!isRedisEnabled()) {
      await this.sendDirect(input);
      return;
    }

    try {
      const job = await this.getQueue().add(SEND_INVITATION_JOB, input, MAIL_JOB_OPTIONS);
      this.logger.log(`邀请邮件已入队：job ${job.id ?? "?"} -> ${input.to}`);
    } catch (error) {
      this.logger.error(`邀请邮件入队失败，降级为直接发送：${(error as Error).message}`);
      await this.sendDirect(input);
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
        this.logger.warn(`关闭邮件队列失败：${(error as Error).message}`);
      }
    }

    if (!connection) return;

    try {
      await connection.quit();
    } catch (error) {
      this.logger.warn(`关闭邮件队列连接失败，执行强制断开：${(error as Error).message}`);
      connection.disconnect();
    }
  }

  private getQueue(): Queue<SendInvitationJobData> {
    if (!this.queue) {
      // BullMQ does not own an externally provided connection, so keep the
      // reference here and quit it explicitly in `close()`.
      this.connection = createBullConnection();
      this.queue = new Queue<SendInvitationJobData>(MAIL_QUEUE, {
        connection: this.connection,
      });
    }
    return this.queue;
  }

  /**
   * Direct send keeps invitation creation non-blocking: an email provider
   * outage must never fail the BetterAuth invitation request itself.
   */
  private async sendDirect(input: SendInvitationJobData): Promise<void> {
    try {
      await this.mailService.sendWorkspaceInvitationEmail(input);
    } catch (error) {
      this.logger.error(`邀请邮件直接发送失败：${(error as Error).message}`);
    }
  }
}

export const mailQueueProducer = new MailQueueProducer();
