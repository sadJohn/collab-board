import { BullModule } from "@nestjs/bullmq";
import { Logger, Module, type OnModuleDestroy } from "@nestjs/common";
import { MailModule } from "./mail.module";
import { MailProcessor } from "./mail.processor";
import { MAIL_QUEUE } from "./mail-queue.constants";
import { mailQueueProducer } from "./mail-queue.producer";

/**
 * Only imported by `AppModule` when `REDIS_URL` is configured, so BullMQ never
 * forces a Redis connection on installations that do not want one.
 */
@Module({
  imports: [MailModule, BullModule.registerQueue({ name: MAIL_QUEUE })],
  providers: [MailProcessor],
})
export class MailQueueModule implements OnModuleDestroy {
  private readonly logger = new Logger(MailQueueModule.name);

  async onModuleDestroy(): Promise<void> {
    await mailQueueProducer.close();
    this.logger.log("邮件队列生产者已关闭");
  }
}
