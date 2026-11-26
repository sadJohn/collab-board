import { BadRequestException, NotFoundException } from "@nestjs/common";
import { prisma, type Task } from "@repo/db";
import type { TaskQuery } from "@repo/shared";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { TasksService } from "./tasks.service";

vi.mock("@repo/db", () => {
  const task = {
    findFirst: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const project = { findFirst: vi.fn() };

  return {
    prisma: {
      task,
      project,
      $transaction: vi.fn((callback: (tx: unknown) => unknown) => callback({ task, project })),
    },
  };
});

const taskFindFirst = vi.mocked(prisma.task.findFirst) as unknown as Mock<
  (args: unknown) => Promise<Task | null>
>;
const taskFindMany = vi.mocked(prisma.task.findMany) as unknown as Mock<
  (args: unknown) => Promise<Task[]>
>;
const taskCount = vi.mocked(prisma.task.count) as unknown as Mock<
  (args: unknown) => Promise<number>
>;
const taskCreate = vi.mocked(prisma.task.create) as unknown as Mock<
  (args: unknown) => Promise<Task>
>;
const taskUpdate = vi.mocked(prisma.task.update) as unknown as Mock<
  (args: unknown) => Promise<Task>
>;
const taskDelete = vi.mocked(prisma.task.delete) as unknown as Mock<
  (args: unknown) => Promise<Task>
>;
const projectFindFirst = vi.mocked(prisma.project.findFirst) as unknown as Mock<
  (args: unknown) => Promise<{ id: string } | null>
>;

function buildTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task_1",
    title: "Write docs",
    description: null,
    status: "BACKLOG",
    priority: "MEDIUM",
    position: 1000,
    projectId: "project_1",
    assigneeId: null,
    creatorId: "user_1",
    dueDate: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

const pageQuery: TaskQuery = {
  sortBy: "position",
  sortOrder: "asc",
  page: 1,
  pageSize: 25,
};

describe("TasksService", () => {
  const service = new TasksService(prisma);

  beforeEach(() => {
    taskFindFirst.mockReset();
    taskFindMany.mockReset();
    taskCount.mockReset();
    taskCreate.mockReset();
    taskUpdate.mockReset();
    taskDelete.mockReset();
    projectFindFirst.mockReset();
  });

  describe("findAll", () => {
    it("scopes by project and applies filters, sorting and pagination", async () => {
      projectFindFirst.mockResolvedValue({ id: "project_1" });
      taskCount.mockResolvedValue(1);
      taskFindMany.mockResolvedValue([buildTask()]);
      const query: TaskQuery = {
        q: "docs",
        statuses: ["TODO"],
        priorities: ["HIGH"],
        sortBy: "dueDate",
        sortOrder: "desc",
        page: 2,
        pageSize: 10,
      };

      const page = await service.findAll("org_1", "project_1", query);

      expect(projectFindFirst).toHaveBeenCalledWith({
        where: { id: "project_1", organizationId: "org_1" },
        select: { id: true },
      });
      expect(taskFindMany).toHaveBeenCalledWith({
        where: {
          projectId: "project_1",
          title: { contains: "docs", mode: "insensitive" },
          status: { in: ["TODO"] },
          priority: { in: ["HIGH"] },
        },
        orderBy: [{ dueDate: "desc" }, { id: "asc" }],
        skip: 10,
        take: 10,
      });
      expect(page).toEqual({ items: [buildTask()], total: 1, page: 2, pageSize: 10 });
    });

    it("rejects listing tasks of a project outside the organization", async () => {
      projectFindFirst.mockResolvedValue(null);

      await expect(service.findAll("org_1", "project_other", pageQuery)).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(taskFindMany).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("appends the task to the bottom of its status column", async () => {
      projectFindFirst.mockResolvedValue({ id: "project_1" });
      taskFindFirst.mockResolvedValue(buildTask({ position: 4000 }));
      taskCreate.mockResolvedValue(buildTask({ position: 5000 }));

      await service.create("org_1", "user_1", {
        title: "New task",
        status: "TODO",
        priority: "HIGH",
        projectId: "project_1",
        description: null,
        assigneeId: null,
        dueDate: null,
      });

      expect(taskFindFirst).toHaveBeenCalledWith({
        where: { projectId: "project_1", status: "TODO" },
        orderBy: { position: "desc" },
        select: { position: true },
      });
      expect(taskCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          title: "New task",
          projectId: "project_1",
          status: "TODO",
          position: 5000,
          creatorId: "user_1",
        }),
      });
    });

    it("rejects creating a task in a project outside the organization", async () => {
      projectFindFirst.mockResolvedValue(null);

      await expect(
        service.create("org_1", "user_1", {
          title: "New task",
          status: "TODO",
          priority: "HIGH",
          projectId: "project_other",
          description: null,
          assigneeId: null,
          dueDate: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(taskCreate).not.toHaveBeenCalled();
    });
  });

  describe("move", () => {
    it("updates status and the midpoint position inside a transaction", async () => {
      taskFindFirst
        .mockResolvedValueOnce(buildTask({ id: "task_1", position: 1000 }))
        .mockResolvedValueOnce(buildTask({ id: "task_prev", position: 1000 }))
        .mockResolvedValueOnce(buildTask({ id: "task_next", position: 2000 }));
      taskUpdate.mockResolvedValue(buildTask({ status: "IN_PROGRESS", position: 1500 }));

      await service.move("org_1", "task_1", {
        status: "IN_PROGRESS",
        previousTaskId: "task_prev",
        nextTaskId: "task_next",
      });

      expect(taskUpdate).toHaveBeenCalledWith({
        where: { id: "task_1" },
        data: { status: "IN_PROGRESS", position: 1500 },
      });
    });

    it("rejects a neighbour that does not belong to the task's project", async () => {
      taskFindFirst.mockResolvedValueOnce(buildTask({ id: "task_1" })).mockResolvedValueOnce(null);

      await expect(
        service.move("org_1", "task_1", {
          status: "TODO",
          previousTaskId: "task_other_project",
          nextTaskId: null,
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(taskUpdate).not.toHaveBeenCalled();
    });

    it("rejects moving a task from another organization", async () => {
      taskFindFirst.mockResolvedValue(null);

      await expect(
        service.move("org_1", "task_other", {
          status: "TODO",
          previousTaskId: null,
          nextTaskId: null,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe("remove", () => {
    it("deletes a task after verifying its project belongs to the organization", async () => {
      taskFindFirst.mockResolvedValue(buildTask());
      taskDelete.mockResolvedValue(buildTask());

      await service.remove("org_1", "task_1");

      expect(taskFindFirst).toHaveBeenCalledWith({
        where: { id: "task_1", project: { organizationId: "org_1" } },
      });
      expect(taskDelete).toHaveBeenCalledWith({ where: { id: "task_1" } });
    });

    it("rejects deleting a task from another organization", async () => {
      taskFindFirst.mockResolvedValue(null);

      await expect(service.remove("org_1", "task_other")).rejects.toBeInstanceOf(NotFoundException);
      expect(taskDelete).not.toHaveBeenCalled();
    });
  });
});
