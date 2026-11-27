import { Global, Module } from "@nestjs/common";
import { NotificationsController } from "./notifications.controller";
import { NotificationsService } from "./notifications.service";

/**
 * Global so business modules (tasks, comments) can inject `NotificationsService`
 * to trigger assignment/comment notifications without an explicit import —
 * mirroring `EventsModule`.
 */
@Global()
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
