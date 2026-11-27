import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient, Task } from "@repo/db";
import {
  type DashboardDto,
  type DashboardProject,
  type TaskDto,
  type TaskStatus,
} from "@repo/shared";
import { PRISMA_CLIENT } from "../prisma/prisma.module";

/** Statuses that count as "not started" in the overview cards. */
const ASSIGNED_STATUSES = ["BACKLOG", "TODO"] as const;

/** Statuses that no longer require work and can never be overdue. */
const CLOSED_STATUSES = ["DONE", "CANCELED"] as const;

/** Upper bound for the "my tasks" list on the dashboard. */
const MAX_MY_TASKS = 20;

function toTaskDto(task: Task): TaskDto {
  return {
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}

@Injectable()
export class DashboardService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  /**
   * Aggregates everything the workspace dashboard needs in a single round trip.
   *
   * Stats and `myTasks` are scoped to the current user; `projects` is scoped to
   * the active workspace. Every query filters through `project.organizationId`
   * so no tenant can read another workspace's tasks.
   */
  async getDashboard(organizationId: string, userId: string): Promise<DashboardDto> {
    if (!organizationId) {
      throw new BadRequestException("请先选择一个工作区");
    }

    const now = new Date();
    const ownedTaskWhere: Prisma.TaskWhereInput = {
      assigneeId: userId,
      project: { organizationId },
    };

    const [assignedCount, inProgressCount, overdueCount, completedCount, myTasks, projects] =
      await Promise.all([
        this.prisma.task.count({
          where: { ...ownedTaskWhere, status: { in: [...ASSIGNED_STATUSES] } },
        }),
        this.prisma.task.count({
          where: { ...ownedTaskWhere, status: "IN_PROGRESS" },
        }),
        this.prisma.task.count({
          where: {
            ...ownedTaskWhere,
            status: { notIn: [...CLOSED_STATUSES] },
            dueDate: { lt: now },
          },
        }),
        this.prisma.task.count({
          where: { ...ownedTaskWhere, status: "DONE" },
        }),
        this.prisma.task.findMany({
          where: {
            ...ownedTaskWhere,
            status: { notIn: [...CLOSED_STATUSES] },
          },
          include: {
            project: { select: { id: true, name: true, key: true } },
          },
          orderBy: [
            { priority: "desc" },
            { dueDate: { sort: "asc", nulls: "last" } },
          ] satisfies Prisma.TaskOrderByWithRelationInput[],
          take: MAX_MY_TASKS,
        }),
        this.loadProjectProgress(organizationId),
      ]);

    return {
      stats: { assignedCount, inProgressCount, overdueCount, completedCount },
      myTasks: myTasks.map((task) => ({
        ...toTaskDto(task),
        project: task.project,
      })),
      projects,
    };
  }

  /**
   * Project list with task totals and completed counts.
   *
   * One `groupBy` covers every project at once (no N+1), and projects without
   * tasks are kept with zeroed counters so the sidebar reflects the workspace.
   */
  private async loadProjectProgress(organizationId: string): Promise<DashboardProject[]> {
    const [projects, groups] = await Promise.all([
      this.prisma.project.findMany({
        where: { organizationId },
        select: { id: true, name: true, key: true },
        orderBy: { createdAt: "asc" },
      }),
      this.prisma.task.groupBy({
        by: ["projectId", "status"],
        where: { project: { organizationId } },
        _count: { _all: true },
      }),
    ]);

    const progress = new Map<string, { taskCount: number; completedCount: number }>();

    for (const group of groups) {
      const current = progress.get(group.projectId) ?? { taskCount: 0, completedCount: 0 };
      const count = group._count._all;

      current.taskCount += count;
      if ((group.status as TaskStatus) === "DONE") {
        current.completedCount += count;
      }

      progress.set(group.projectId, current);
    }

    return projects.map((project) => {
      const counters = progress.get(project.id) ?? { taskCount: 0, completedCount: 0 };
      return { ...project, ...counters };
    });
  }
}
