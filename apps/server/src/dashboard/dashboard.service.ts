import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient, Task } from "@repo/db";
import {
  type DashboardDto,
  type DashboardProject,
  TASK_STATUSES,
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

/** Daily buckets are always computed in this timezone (per the Phase 10 spec). */
const TREND_TIME_ZONE = "Asia/Shanghai";
const TREND_DAYS = 7;

/** `en-CA` formats dates as `YYYY-MM-DD`, exactly what the trend series needs. */
function shanghaiDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TREND_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Last seven Shanghai calendar days, oldest first, ending with today. */
function buildRecentDayKeys(now: Date): string[] {
  const keys: string[] = [];
  for (let offset = TREND_DAYS - 1; offset >= 0; offset -= 1) {
    keys.push(shanghaiDateKey(new Date(now.getTime() - offset * 24 * 60 * 60 * 1000)));
  }
  return keys;
}

/** UTC instant for 00:00 Asia/Shanghai (UTC+8, no DST) on a `YYYY-MM-DD` day. */
function shanghaiDayStart(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00+08:00`);
}

function toTaskDto(task: Task): TaskDto {
  return {
    ...task,
    dueDate: task.dueDate?.toISOString() ?? null,
    completedAt: task.completedAt?.toISOString() ?? null,
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
    const dayKeys = buildRecentDayKeys(now);
    const trendStart = shanghaiDayStart(dayKeys[0]);

    const [
      assignedCount,
      inProgressCount,
      overdueCount,
      completedCount,
      myTasks,
      projects,
      statusGroups,
      trendRows,
    ] = await Promise.all([
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
      this.prisma.task.groupBy({
        by: ["status"],
        where: { project: { organizationId } },
        _count: { _all: true },
      }),
      this.loadTrendRows(organizationId, trendStart),
    ]);

    const statusCounts = new Map<TaskStatus, number>();
    for (const group of statusGroups) {
      statusCounts.set(group.status as TaskStatus, group._count._all);
    }

    const createdByDay = new Map<string, number>(dayKeys.map((day) => [day, 0]));
    const completedByDay = new Map<string, number>(dayKeys.map((day) => [day, 0]));

    for (const row of trendRows) {
      const createdKey = shanghaiDateKey(row.createdAt);
      if (createdByDay.has(createdKey)) {
        createdByDay.set(createdKey, (createdByDay.get(createdKey) ?? 0) + 1);
      }

      if (row.status === "DONE") {
        // Legacy rows completed before `completedAt` existed fall back to
        // `updatedAt` as an approximation of the completion moment.
        const completedKey = shanghaiDateKey(row.completedAt ?? row.updatedAt);
        if (completedByDay.has(completedKey)) {
          completedByDay.set(completedKey, (completedByDay.get(completedKey) ?? 0) + 1);
        }
      }
    }

    return {
      stats: { assignedCount, inProgressCount, overdueCount, completedCount },
      myTasks: myTasks.map((task) => ({
        ...toTaskDto(task),
        project: task.project,
      })),
      projects,
      statusDistribution: TASK_STATUSES.map((status) => ({
        status,
        count: statusCounts.get(status) ?? 0,
      })),
      weeklyTrend: dayKeys.map((date) => ({
        date,
        created: createdByDay.get(date) ?? 0,
        completed: completedByDay.get(date) ?? 0,
      })),
    };
  }

  /** Tasks created or completed since `start`, for the seven-day trend buckets. */
  private loadTrendRows(organizationId: string, start: Date) {
    return this.prisma.task.findMany({
      where: {
        project: { organizationId },
        OR: [
          { createdAt: { gte: start } },
          {
            status: "DONE",
            OR: [{ completedAt: { gte: start } }, { completedAt: null, updatedAt: { gte: start } }],
          },
        ],
      },
      select: { createdAt: true, completedAt: true, updatedAt: true, status: true },
    });
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
