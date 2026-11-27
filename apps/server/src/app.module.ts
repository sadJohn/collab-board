import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AuthController } from "./auth/auth.controller";
import { CommentsModule } from "./comments/comments.module";
import { DashboardModule } from "./dashboard/dashboard.module";
import { EventsModule } from "./events/events.module";
import { MailModule } from "./mail/mail.module";
import { MailQueueModule } from "./mail/mail-queue.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProjectsModule } from "./projects/projects.module";
import { RedisModule } from "./redis/redis.module";
import { bullConnectionOptions } from "./redis/redis-connection";
import { isRedisEnabled } from "./redis/redis-url";
import { TasksModule } from "./tasks/tasks.module";
import { UploadsModule } from "./uploads/uploads.module";

/**
 * BullMQ must only be registered when Redis is configured — otherwise the
 * worker would force a connection at boot and break `REDIS_URL=""` installs.
 */
const redisModules = isRedisEnabled()
  ? [
      BullModule.forRootAsync({
        useFactory: () => ({ connection: bullConnectionOptions() }),
      }),
      MailQueueModule,
    ]
  : [];

@Module({
  imports: [
    PrismaModule,
    RedisModule,
    EventsModule,
    NotificationsModule,
    ProjectsModule,
    TasksModule,
    CommentsModule,
    DashboardModule,
    UploadsModule,
    MailModule,
    ...redisModules,
  ],
  controllers: [AppController, AuthController],
})
export class AppModule {}
