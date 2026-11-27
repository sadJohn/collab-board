import { BadRequestException } from "@nestjs/common";
import { prisma } from "@repo/db";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { DashboardService } from "./dashboard.service";

vi.mock("@repo/db", () => {
  const task = { count: vi.fn(), findMany: vi.fn(), groupBy: vi.fn() };
  const project = { findMany: vi.fn() };
  return { prisma: { task, project } };
});

const taskCount = vi.mocked(prisma.task.count) as unknown as Mock<
  (args: unknown) => Promise<number>
>;
const taskFindMany = vi.mocked(prisma.task.findMany) as unknown as Mock<
  (args: unknown) => Promise<unknown[]>
>;
const taskGroupBy = vi.mocked(prisma.task.groupBy) as unknown as Mock<
  (args: unknown) => Promise<unknown[]>
>;
const projectFindMany = vi.mocked(prisma.project.findMany) as unknown as Mock<
  (args: unknown) => Promise<unknown[]>
>;

const organizationId = "org_1";
const userId = "user_1";

function buildTaskRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "task_1",
    title: "Ship the dashboard",
    description: null,
    status: "TODO",
    priority: "HIGH",
    position: 1000,
    projectId: "project_1",
    assigneeId: userId,
    creatorId: "user_2",
    dueDate: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    project: { id: "project_1", name: "Engineering", key: "ENG" },
    ...overrides,
  };
}

/** Returns the Prisma args of the Nth `task.count` call. */
function countArgs(index: number): Record<string, unknown> {
  return (taskCount.mock.calls[index] as unknown[])[0] as Record<string, unknown>;
}

describe("DashboardService", () => {
  const service = new DashboardService(prisma);

  beforeEach(() => {
    taskCount.mockReset();
    taskFindMany.mockReset();
    taskGroupBy.mockReset();
    projectFindMany.mockReset();

    taskCount.mockResolvedValue(0);
    taskFindMany.mockResolvedValue([]);
    taskGroupBy.mockResolvedValue([]);
    projectFindMany.mockResolvedValue([]);
  });

  it("computes the four mutually exclusive stat buckets for the current user", async () => {
    taskCount
      .mockResolvedValueOnce(4) // assigned
      .mockResolvedValueOnce(2) // in progress
      .mockResolvedValueOnce(3) // overdue
      .mockResolvedValueOnce(7); // completed

    const result = await service.getDashboard(organizationId, userId);

    expect(result.stats).toEqual({
      assignedCount: 4,
      inProgressCount: 2,
      overdueCount: 3,
      completedCount: 7,
    });

    expect(countArgs(0).where).toEqual({
      assigneeId: userId,
      project: { organizationId },
      status: { in: ["BACKLOG", "TODO"] },
    });
    expect(countArgs(1).where).toEqual({
      assigneeId: userId,
      project: { organizationId },
      status: "IN_PROGRESS",
    });
    expect(countArgs(2).where).toMatchObject({
      assigneeId: userId,
      project: { organizationId },
      status: { notIn: ["DONE", "CANCELED"] },
      dueDate: { lt: expect.any(Date) },
    });
    expect(countArgs(3).where).toEqual({
      assigneeId: userId,
      project: { organizationId },
      status: "DONE",
    });
  });

  it("lists open assigned tasks with the documented ordering, project badge and limit", async () => {
    taskFindMany.mockResolvedValue([
      buildTaskRow({ id: "task_1", dueDate: new Date("2026-02-01T00:00:00.000Z") }),
    ]);

    const result = await service.getDashboard(organizationId, userId);

    const args = (taskFindMany.mock.calls[0] as unknown[])[0] as Record<string, never>;
    expect(args).toMatchObject({
      where: {
        assigneeId: userId,
        project: { organizationId },
        status: { notIn: ["DONE", "CANCELED"] },
      },
      include: { project: { select: { id: true, name: true, key: true } } },
      orderBy: [{ priority: "desc" }, { dueDate: { sort: "asc", nulls: "last" } }],
      take: 20,
    });

    expect(result.myTasks[0]).toMatchObject({
      id: "task_1",
      dueDate: "2026-02-01T00:00:00.000Z",
      project: { id: "project_1", name: "Engineering", key: "ENG" },
    });
    expect(result.myTasks[0].createdAt).toBe("2026-01-01T00:00:00.000Z");
  });

  it("aggregates project progress without N+1 queries and keeps empty projects", async () => {
    projectFindMany.mockResolvedValue([
      { id: "project_1", name: "Engineering", key: "ENG" },
      { id: "project_2", name: "Design", key: "DSG" },
      { id: "project_3", name: "Empty", key: "EMP" },
    ]);
    taskGroupBy.mockResolvedValue([
      { projectId: "project_1", status: "DONE", _count: { _all: 3 } },
      { projectId: "project_1", status: "TODO", _count: { _all: 2 } },
      { projectId: "project_2", status: "IN_PROGRESS", _count: { _all: 1 } },
    ]);

    const result = await service.getDashboard(organizationId, userId);

    expect(result.projects).toEqual([
      { id: "project_1", name: "Engineering", key: "ENG", taskCount: 5, completedCount: 3 },
      { id: "project_2", name: "Design", key: "DSG", taskCount: 1, completedCount: 0 },
      { id: "project_3", name: "Empty", key: "EMP", taskCount: 0, completedCount: 0 },
    ]);
    expect(taskGroupBy).toHaveBeenCalledExactlyOnceWith({
      by: ["projectId", "status"],
      where: { project: { organizationId } },
      _count: { _all: true },
    });
  });

  it("returns a fully zeroed payload for an empty workspace", async () => {
    const result = await service.getDashboard(organizationId, userId);

    expect(result.stats).toEqual({
      assignedCount: 0,
      inProgressCount: 0,
      overdueCount: 0,
      completedCount: 0,
    });
    expect(result.myTasks).toEqual([]);
    expect(result.projects).toEqual([]);
  });

  it("rejects requests without an active organization before querying the database", async () => {
    await expect(service.getDashboard("", userId)).rejects.toBeInstanceOf(BadRequestException);
    expect(taskCount).not.toHaveBeenCalled();
    expect(taskFindMany).not.toHaveBeenCalled();
    expect(projectFindMany).not.toHaveBeenCalled();
  });
});
