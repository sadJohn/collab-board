import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { MailService } from "./mail.service";
import { MAIL_QUEUE, type SendInvitationJobData } from "./mail-queue.constants";

/**
 * Background consumer for the `mail` queue.
 *
 * `MailService` throws when the email provider rejects the message, which makes
 * BullMQ honor the job's retry policy (3 attempts, exponential backoff). A
 * successful local-dev fallback (no `RESEND_API_KEY`) resolves normally.
 */
@Processor(MAIL_QUEUE)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(private readonly mailService: MailService) {
    super();
  }

  override async process(job: Job<SendInvitationJobData>): Promise<void> {
    this.logger.log(
      `消费邮件任务 ${job.id ?? "?"}（第 ${job.attemptsMade + 1} 次尝试），收件人：${job.data.to}`,
    );

    await this.mailService.sendWorkspaceInvitationEmail(job.data);

    this.logger.log(`邮件任务 ${job.id ?? "?"} 发送成功`);
  }
}
