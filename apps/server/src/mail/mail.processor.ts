import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { MailService } from "./mail.service";
import {
  MAIL_QUEUE,
  type MailJobData,
  SEND_INVITATION_JOB,
  SEND_RESET_PASSWORD_JOB,
  SEND_VERIFICATION_JOB,
  type SendInvitationJobData,
  type SendResetPasswordJobData,
  type SendVerificationJobData,
} from "./mail-queue.constants";

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

  override async process(job: Job<MailJobData>): Promise<void> {
    this.logger.log(
      `消费邮件任务 ${job.id ?? "?"}（${job.name}，第 ${job.attemptsMade + 1} 次尝试）`,
    );

    switch (job.name) {
      case SEND_INVITATION_JOB:
        await this.mailService.sendWorkspaceInvitationEmail(job.data as SendInvitationJobData);
        break;
      case SEND_VERIFICATION_JOB:
        await this.mailService.sendVerificationEmail(job.data as SendVerificationJobData);
        break;
      case SEND_RESET_PASSWORD_JOB:
        await this.mailService.sendResetPasswordEmail(job.data as SendResetPasswordJobData);
        break;
      default:
        throw new Error(`未知邮件任务类型：${job.name}`);
    }

    this.logger.log(`邮件任务 ${job.id ?? "?"} 发送成功`);
  }
}
