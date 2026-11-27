import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AuthController } from "./auth/auth.controller";
import { CommentsModule } from "./comments/comments.module";
import { EventsModule } from "./events/events.module";
import { MailModule } from "./mail/mail.module";
import { NotificationsModule } from "./notifications/notifications.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProjectsModule } from "./projects/projects.module";
import { TasksModule } from "./tasks/tasks.module";
import { UploadsModule } from "./uploads/uploads.module";

@Module({
  imports: [
    PrismaModule,
    EventsModule,
    NotificationsModule,
    ProjectsModule,
    TasksModule,
    CommentsModule,
    UploadsModule,
    MailModule,
  ],
  controllers: [AppController, AuthController],
})
export class AppModule {}
