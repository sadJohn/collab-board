import { Logger } from "@nestjs/common";
import { Queue } from "bullmq";
import { createBullConnection } from "../redis/redis-connection";
import { isRedisEnabled } from "../redis/redis-url";
import { MailService } from "./mail.service";
import {
  MAIL_JOB_OPTIONS,
  MAIL_QUEUE,
  type MailJobData,
  SEND_INVITATION_JOB,
  SEND_RESET_PASSWORD_JOB,
  SEND_VERIFICATION_JOB,
  type SendInvitationJobData,
  type SendResetPasswordJobData,
  type SendVerificationJobData,
} from "./mail-queue.constants";

/** Resolves the recipient for either the invitation or the auth-email payload. */
function recipientOf(data: MailJobData): string {
  return "email" in data ? data.email : data.to;
}

/**
 * DI-free singleton used by the BetterAuth `sendInvitationEmail`,
 * `sendVerificationEmail` and `sendResetPassword` hooks.
 *
 * Why not a Nest provider: `apps/server/src/auth/auth.ts` builds the BetterAuth
 * instance at module load time, outside the Nest container, so it cannot inject
 * `MailService` / `Queue`. This producer lazily creates its BullMQ `Queue`
 * (sharing `createBullConnection` with the Nest worker) and falls back to a
 * direct `MailService` call when `REDIS_URL` is empty — keeping local
 * development working without Redis.
 */
class MailQueueProducer {
  private readonly logger = new Logger(MailQueueProducer.name);
  private readonly mailService = new MailService();
  private queue: Queue<MailJobData> | null = null;
  private connection: ReturnType<typeof createBullConnection> | null = null;

  /** Enqueues the invitation email, or sends it inline when Redis is disabled. */
  async enqueueInvitation(input: SendInvitationJobData): Promise<void> {
    await this.enqueue(SEND_INVITATION_JOB, input, () =>
      this.mailService.sendWorkspaceInvitationEmail(input),
    );
  }

  /** Enqueues the email-verification link, or sends it inline without Redis. */
  async enqueueVerification(input: SendVerificationJobData): Promise<void> {
    await this.enqueue(SEND_VERIFICATION_JOB, input, () =>
      this.mailService.sendVerificationEmail(input),
    );
  }

  /** Enqueues the password-reset link, or sends it inline without Redis. */
  async enqueueResetPassword(input: SendResetPasswordJobData): Promise<void> {
    await this.enqueue(SEND_RESET_PASSWORD_JOB, input, () =>
      this.mailService.sendResetPasswordEmail(input),
    );
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

  private async enqueue(
    jobName: string,
    data: MailJobData,
    sendDirect: () => Promise<void>,
  ): Promise<void> {
    if (!isRedisEnabled()) {
      await this.runDirect(jobName, data, sendDirect);
      return;
    }

    try {
      const job = await this.getQueue().add(jobName, data, MAIL_JOB_OPTIONS);
      this.logger.log(`${jobName} 邮件已入队：job ${job.id ?? "?"} -> ${recipientOf(data)}`);
    } catch (error) {
      this.logger.error(`${jobName} 邮件入队失败，降级为直接发送：${(error as Error).message}`);
      await this.runDirect(jobName, data, sendDirect);
    }
  }

  private getQueue(): Queue<MailJobData> {
    if (!this.queue) {
      // BullMQ does not own an externally provided connection, so keep the
      // reference here and quit it explicitly in `close()`.
      this.connection = createBullConnection();
      this.queue = new Queue<MailJobData>(MAIL_QUEUE, {
        connection: this.connection,
      });
    }
    return this.queue;
  }

  /**
   * Direct send keeps the auth flow non-blocking: an email provider outage must
   * never fail sign-up, verification or password-reset requests themselves.
   */
  private async runDirect(
    jobName: string,
    data: MailJobData,
    sendDirect: () => Promise<void>,
  ): Promise<void> {
    try {
      await sendDirect();
    } catch (error) {
      this.logger.error(
        `${jobName} 邮件直接发送失败（${recipientOf(data)}）：${(error as Error).message}`,
      );
    }
  }
}

export const mailQueueProducer = new MailQueueProducer();
