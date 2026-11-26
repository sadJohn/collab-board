import { Module } from "@nestjs/common";
import { AppController } from "./app.controller";
import { AuthController } from "./auth/auth.controller";
import { CommentsModule } from "./comments/comments.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ProjectsModule } from "./projects/projects.module";
import { TasksModule } from "./tasks/tasks.module";

@Module({
  imports: [PrismaModule, ProjectsModule, TasksModule, CommentsModule],
  controllers: [AppController, AuthController],
})
export class AppModule {}
