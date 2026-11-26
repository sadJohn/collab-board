import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import type { Task } from "@repo/db";
import {
  type CreateTaskData,
  createTaskSchema,
  type MoveTaskData,
  moveTaskSchema,
  type TaskQuery,
  taskQuerySchema,
  type UpdateTaskData,
  updateTaskSchema,
} from "@repo/shared";
import { AuthGuard, type AuthUser } from "../auth/auth.guard";
import { CurrentOrganization } from "../auth/current-organization.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { OrganizationGuard } from "../auth/organization.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { type TaskPage, TasksService } from "./tasks.service";

@Controller()
@UseGuards(AuthGuard, OrganizationGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get("projects/:projectId/tasks")
  findAll(
    @CurrentOrganization() organizationId: string,
    @Param("projectId") projectId: string,
    @Query(new ZodValidationPipe(taskQuerySchema)) query: TaskQuery,
  ): Promise<TaskPage> {
    return this.tasksService.findAll(organizationId, projectId, query);
  }

  @Post("tasks")
  create(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createTaskSchema)) data: CreateTaskData,
  ): Promise<Task> {
    return this.tasksService.create(organizationId, user.id, data);
  }

  @Patch("tasks/:id")
  update(
    @CurrentOrganization() organizationId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateTaskSchema)) data: UpdateTaskData,
  ): Promise<Task> {
    return this.tasksService.update(organizationId, id, data);
  }

  @Post("tasks/:id/move")
  move(
    @CurrentOrganization() organizationId: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(moveTaskSchema)) data: MoveTaskData,
  ): Promise<Task> {
    return this.tasksService.move(organizationId, id, data);
  }

  @Delete("tasks/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentOrganization() organizationId: string,
    @Param("id") id: string,
  ): Promise<void> {
    await this.tasksService.remove(organizationId, id);
  }
}
