import { BadRequestException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Prisma, PrismaClient, Task, TaskStatus } from "@repo/db";
import {
  type CreateTaskData,
  computePosition,
  INITIAL_TASK_POSITION,
  type MoveTaskData,
  TASK_POSITION_STEP,
  type TaskQuery,
  type UpdateTaskData,
} from "@repo/shared";
import { PRISMA_CLIENT } from "../prisma/prisma.module";

export interface TaskPage {
  items: Task[];
  total: number;
  page: number;
  pageSize: number;
}

@Injectable()
export class TasksService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

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

  async create(organizationId: string, creatorId: string, data: CreateTaskData): Promise<Task> {
    await this.assertProjectInOrganization(organizationId, data.projectId);

    const lastTask = await this.prisma.task.findFirst({
      where: { projectId: data.projectId, status: data.status },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    // New tasks always land at the bottom of their status column.
    const { position } = computePosition(lastTask?.position ?? null, null);

    return this.prisma.task.create({
      data: { ...data, position, creatorId },
    });
  }

  async update(organizationId: string, id: string, data: UpdateTaskData): Promise<Task> {
    const task = await this.findOwnedTask(organizationId, id);

    return this.prisma.task.update({
      where: { id: task.id },
      data,
    });
  }

  async move(organizationId: string, id: string, data: MoveTaskData): Promise<Task> {
    return this.prisma.$transaction(async (tx) => {
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

      return tx.task.update({
        where: { id: task.id },
        data: { status: data.status, position: computed.position },
      });
    });
  }

  async remove(organizationId: string, id: string): Promise<void> {
    const task = await this.findOwnedTask(organizationId, id);
    await this.prisma.task.delete({ where: { id: task.id } });
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
