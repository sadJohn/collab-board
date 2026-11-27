import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient, Task, TaskStatus } from "@repo/db";
import {
  type CreateTaskData,
  computePosition,
  INITIAL_TASK_POSITION,
  type MoveTaskData,
  SOCKET_EVENTS,
  TASK_POSITION_STEP,
  type TaskDto,
  type TaskQuery,
  type UpdateTaskData,
} from "@repo/shared";
import { EventsService } from "../events/events.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PRISMA_CLIENT } from "../prisma/prisma.module";
import { RedisService } from "../redis/redis.service";
import { dashboardVersionKey } from "../redis/redis-keys";

export interface TaskPage {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
}

/** Serializes a Prisma task into the wire/ socket DTO (ISO timestamps). */
function toTaskDto(task: Task): TaskDto {
  return {
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

/**
 * Keeps `completedAt` in sync with status transitions: entering DONE stamps
 * "now", leaving DONE clears it, and every other transition is a no-op.
 */
function completedAtPatch(
  nextStatus: TaskStatus | undefined,
  currentStatus: TaskStatus,
): { completedAt?: Date | null } {
  if (nextStatus === undefined || nextStatus === currentStatus) {
    return {};
  }
  if (nextStatus === "DONE") {
    return { completedAt: new Date() };
  }
  if (currentStatus === "DONE") {
    return { completedAt: null };
  }
  return {};
}

@Injectable()
export class TasksService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
    private readonly redis: RedisService,
  ) {}

  async findAll(organizationId: string, projectId: string, query: TaskQuery): Promise<TaskPage> {
    await this.assertProjectInOrganization(organizationId, projectId);

    const where: Prisma.TaskWhereInput = { projectId };
    if (query.q) {
      where.title = { contains: query.q, mode: "insensitive" };
    }
    if (query.statuses?.length) {
      where.status = { in: query.statuses };
    }
    if (query.priorities?.length) {
      where.priority = { in: query.priorities };
    }

    const orderBy = [
      { [query.sortBy]: query.sortOrder },
      { id: "asc" },
    ] as Prisma.TaskOrderByWithRelationInput[];

    const [items, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      this.prisma.task.count({ where }),
    ]);

    return { items, total, page: query.page, pageSize: query.pageSize };
  }

  async findOne(organizationId: string, id: string): Promise<Task> {
    return this.findOwnedTask(organizationId, id);
  }

  async create(organizationId: string, creatorId: string, data: CreateTaskData): Promise<Task> {
    await this.assertProjectInOrganization(organizationId, data.projectId);

    const lastTask = await this.prisma.task.findFirst({
      where: { projectId: data.projectId, status: data.status },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    // New tasks always land at the bottom of their status column.
    const { position } = computePosition(lastTask?.position ?? null, null);

    const task = await this.prisma.task.create({
      data: {
        ...data,
        position,
        creatorId,
        completedAt: data.status === "DONE" ? new Date() : null,
      },
    });

    await this.invalidateDashboard(organizationId);

    this.events.emitToProject(task.projectId, SOCKET_EVENTS.TASK_CREATED, {
      task: toTaskDto(task),
      actorId: creatorId,
    });

    if (data.assigneeId && data.assigneeId !== creatorId) {
      await this.notifyTaskAssigned(data.assigneeId, {
        taskId: task.id,
        taskTitle: task.title,
        projectId: task.projectId,
        organizationId,
        actorId: creatorId,
      }).catch(() => undefined);
    }

    return task;
  }

  async update(
    organizationId: string,
    id: string,
    data: UpdateTaskData,
    actorId: string,
  ): Promise<Task> {
    const task = await this.findOwnedTask(organizationId, id);

    const updated = await this.prisma.task.update({
      where: { id: task.id },
      data: { ...data, ...completedAtPatch(data.status, task.status) },
    });

    await this.invalidateDashboard(organizationId);

    this.events.emitToProject(updated.projectId, SOCKET_EVENTS.TASK_UPDATED, {
      task: toTaskDto(updated),
      actorId,
    });

    // Notify when the task is reassigned to a different, non-self user.
    const nextAssigneeId = data.assigneeId;
    if (
      nextAssigneeId !== undefined &&
      nextAssigneeId !== null &&
      nextAssigneeId !== task.assigneeId &&
      nextAssigneeId !== actorId
    ) {
      await this.notifyTaskAssigned(nextAssigneeId, {
        taskId: updated.id,
        taskTitle: updated.title,
        projectId: updated.projectId,
        organizationId,
        actorId,
      }).catch(() => undefined);
    }

    return updated;
  }

  async move(
    organizationId: string,
    id: string,
    data: MoveTaskData,
    actorId: string,
  ): Promise<Task> {
    const { task: moved, fromStatus } = await this.prisma.$transaction(async (tx) => {
      const task = await tx.task.findFirst({
        where: { id, project: { organizationId } },
      });

      if (!task) {
        throw new NotFoundException("任务不存在");
      }

      const [previous, next] = await Promise.all([
        data.previousTaskId
          ? tx.task.findFirst({ where: { id: data.previousTaskId, projectId: task.projectId } })
          : null,
        data.nextTaskId
          ? tx.task.findFirst({ where: { id: data.nextTaskId, projectId: task.projectId } })
          : null,
      ]);

      if (data.previousTaskId && !previous) {
        throw new BadRequestException("前一个任务不属于该项目");
      }
      if (data.nextTaskId && !next) {
        throw new BadRequestException("后一个任务不属于该项目");
      }

      let computed = computePosition(previous?.position ?? null, next?.position ?? null);

      if (computed.rebalanceRequired) {
        await this.rebalanceColumn(tx, task.projectId, data.status);

        const [previousAfter, nextAfter] = await Promise.all([
          data.previousTaskId ? tx.task.findFirst({ where: { id: data.previousTaskId } }) : null,
          data.nextTaskId ? tx.task.findFirst({ where: { id: data.nextTaskId } }) : null,
        ]);

        computed = computePosition(previousAfter?.position ?? null, nextAfter?.position ?? null);
      }

      const updated = await tx.task.update({
        where: { id: task.id },
        data: {
          status: data.status,
          position: computed.position,
          ...completedAtPatch(data.status, task.status),
        },
      });

      return { task: updated, fromStatus: task.status };
    });

    this.events.emitToProject(moved.projectId, SOCKET_EVENTS.TASK_MOVED, {
      task: toTaskDto(moved),
      actorId,
      fromStatus,
    });

    await this.invalidateDashboard(organizationId);

    return moved;
  }

  async remove(organizationId: string, id: string, actorId: string): Promise<void> {
    const task = await this.findOwnedTask(organizationId, id);
    await this.prisma.task.delete({ where: { id: task.id } });

    await this.invalidateDashboard(organizationId);

    this.events.emitToProject(task.projectId, SOCKET_EVENTS.TASK_DELETED, {
      taskId: task.id,
      projectId: task.projectId,
      actorId,
    });
  }

  /** Bumps the workspace dashboard version so all cached dashboards go stale. */
  private async invalidateDashboard(organizationId: string): Promise<void> {
    await this.redis.incr(dashboardVersionKey(organizationId));
  }

  /** Looks up the actor's display name, falling back to their id if missing. */
  private async getActorName(actorId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true },
    });
    return user?.name ?? actorId;
  }

  /** Builds the assignment payload and pushes a TASK_ASSIGNED notification. */
  private async notifyTaskAssigned(
    recipientId: string,
    context: {
      taskId: string;
      taskTitle: string;
      projectId: string;
      organizationId: string;
      actorId: string;
    },
  ): Promise<void> {
    const actorName = await this.getActorName(context.actorId);
    await this.notifications.createAndPush({
      userId: recipientId,
      type: "TASK_ASSIGNED",
      payload: {
        taskId: context.taskId,
        taskTitle: context.taskTitle,
        projectId: context.projectId,
        organizationId: context.organizationId,
        actorName,
      },
    });
  }

  private async findOwnedTask(organizationId: string, id: string): Promise<Task> {
    const task = await this.prisma.task.findFirst({
      where: { id, project: { organizationId } },
    });

    if (!task) {
      throw new NotFoundException("任务不存在");
    }

    return task;
  }

  private async assertProjectInOrganization(
    organizationId: string,
    projectId: string,
  ): Promise<void> {
    const project = await this.prisma.project.findFirst({
      where: { id: projectId, organizationId },
      select: { id: true },
    });

    if (!project) {
      throw new NotFoundException("项目不存在");
    }
  }

  /** Renumbers a column with evenly spaced positions after float precision runs out. */
  private async rebalanceColumn(
    tx: Prisma.TransactionClient,
    projectId: string,
    status: TaskStatus,
  ): Promise<void> {
    const tasks = await tx.task.findMany({
      where: { projectId, status },
      orderBy: { position: "asc" },
      select: { id: true },
    });

    for (const [index, task] of tasks.entries()) {
      await tx.task.update({
        where: { id: task.id },
        data: { position: INITIAL_TASK_POSITION + index * TASK_POSITION_STEP },
      });
    }
  }
}
