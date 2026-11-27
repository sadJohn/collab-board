import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { type Comment, prisma } from "@repo/db";
import { SOCKET_EVENTS } from "@repo/shared";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { EventsService } from "../events/events.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { CommentsService } from "./comments.service";

type TaskInfo = {
  id: string;
  projectId: string;
  title: string;
  creatorId: string;
  assigneeId: string | null;
  organizationId: string;
  project: { organizationId: string };
};

vi.mock("@repo/db", () => ({
  prisma: {
    task: { findFirst: vi.fn() },
    comment: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    user: { findUnique: vi.fn() },
  },
}));

const taskFindFirst = vi.mocked(prisma.task.findFirst) as unknown as Mock<
  (args: unknown) => Promise<TaskInfo | null>
>;
const userFindUnique = vi.mocked(prisma.user.findUnique) as unknown as Mock<
  (args: unknown) => Promise<{ name: string } | null>
>;
const commentFindMany = vi.mocked(prisma.comment.findMany) as unknown as Mock<
  (args: unknown) => Promise<Comment[]>
>;
const commentCreate = vi.mocked(prisma.comment.create) as unknown as Mock<
  (args: unknown) => Promise<Comment>
>;
const commentFindFirst = vi.mocked(prisma.comment.findFirst) as unknown as Mock<
  (args: unknown) => Promise<(Comment & { task: { projectId: string } }) | null>
>;
const commentDelete = vi.mocked(prisma.comment.delete) as unknown as Mock<
  (args: unknown) => Promise<Comment>
>;

function buildComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "comment_1",
    content: "Looks good",
    taskId: "task_1",
    authorId: "user_1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

function buildCommentWithTask(
  overrides: Partial<Comment> = {},
): Comment & { task: { projectId: string } } {
  return { ...buildComment(overrides), task: { projectId: "project_1" } };
}

function buildTaskInfo(overrides: Partial<TaskInfo> = {}): TaskInfo {
  const organizationId = overrides.organizationId ?? "org_1";
  return {
    id: "task_1",
    projectId: "project_1",
    title: "Ship feature",
    creatorId: "user_1",
    assigneeId: null,
    organizationId,
    project: { organizationId },
    ...overrides,
  };
}

describe("CommentsService", () => {
  const emitToProject = vi.fn();
  const createAndPush = vi.fn().mockResolvedValue(undefined);
  const events = { emitToProject } as unknown as EventsService;
  const notifications = { createAndPush } as unknown as NotificationsService;
  const service = new CommentsService(prisma, events, notifications);

  beforeEach(() => {
    taskFindFirst.mockReset();
    commentFindMany.mockReset();
    commentCreate.mockReset();
    commentFindFirst.mockReset();
    commentDelete.mockReset();
    userFindUnique.mockReset();
    emitToProject.mockReset();
    createAndPush.mockReset();
    createAndPush.mockResolvedValue(undefined);
  });

  describe("findAll", () => {
    it("lists the comments of a task in chronological order", async () => {
      taskFindFirst.mockResolvedValue(buildTaskInfo());
      commentFindMany.mockResolvedValue([buildComment()]);

      const comments = await service.findAll("org_1", "task_1");

      expect(taskFindFirst).toHaveBeenCalledWith({
        where: { id: "task_1", project: { organizationId: "org_1" } },
        select: {
          id: true,
          projectId: true,
          title: true,
          creatorId: true,
          assigneeId: true,
          project: { select: { organizationId: true } },
        },
      });
      expect(commentFindMany).toHaveBeenCalledWith({
        where: { taskId: "task_1" },
        orderBy: { createdAt: "asc" },
      });
      expect(comments).toHaveLength(1);
    });

    it("rejects listing comments of a task outside the organization", async () => {
      taskFindFirst.mockResolvedValue(null);

      await expect(service.findAll("org_1", "task_other")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(commentFindMany).not.toHaveBeenCalled();
    });
  });

  describe("create", () => {
    it("stores the comment and broadcasts COMMENT_ADDED once", async () => {
      taskFindFirst.mockResolvedValue(buildTaskInfo());
      commentCreate.mockResolvedValue(buildComment({ content: "Nice work" }));

      await service.create("org_1", "user_1", { taskId: "task_1", content: "Nice work" });

      expect(commentCreate).toHaveBeenCalledWith({
        data: { content: "Nice work", taskId: "task_1", authorId: "user_1" },
      });
      expect(emitToProject).toHaveBeenCalledExactlyOnceWith(
        "project_1",
        SOCKET_EVENTS.COMMENT_ADDED,
        {
          comment: expect.objectContaining({
            id: "comment_1",
            content: "Nice work",
            taskId: "task_1",
            authorId: "user_1",
            createdAt: "2026-01-01T00:00:00.000Z",
          }),
          projectId: "project_1",
          actorId: "user_1",
        },
      );
    });

    it("rejects commenting on a task outside the organization and does not broadcast", async () => {
      taskFindFirst.mockResolvedValue(null);

      await expect(
        service.create("org_1", "user_1", { taskId: "task_other", content: "Nice work" }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(commentCreate).not.toHaveBeenCalled();
      expect(emitToProject).not.toHaveBeenCalled();
    });

    it("notifies the creator and assignee (deduped), excluding the author, with a snippet", async () => {
      taskFindFirst.mockResolvedValue(buildTaskInfo({ creatorId: "user_1", assigneeId: "user_2" }));
      commentCreate.mockResolvedValue(buildComment({ content: "Looks good" }));
      userFindUnique.mockResolvedValue({ name: "Carol" });

      await service.create("org_1", "user_3", { taskId: "task_1", content: "Looks good" });

      expect(userFindUnique).toHaveBeenCalledWith({
        where: { id: "user_3" },
        select: { name: true },
      });
      expect(createAndPush).toHaveBeenCalledTimes(2);
      expect(createAndPush).toHaveBeenCalledWith({
        userId: "user_1",
        type: "COMMENT_ADDED",
        payload: expect.objectContaining({
          taskId: "task_1",
          taskTitle: "Ship feature",
          projectId: "project_1",
          organizationId: "org_1",
          actorName: "Carol",
          commentSnippet: "Looks good",
        }),
      });
      expect(createAndPush).toHaveBeenCalledWith({
        userId: "user_2",
        type: "COMMENT_ADDED",
        payload: expect.objectContaining({ actorName: "Carol", commentSnippet: "Looks good" }),
      });
    });

    it("does not notify when the author is the only recipient", async () => {
      taskFindFirst.mockResolvedValue(buildTaskInfo({ creatorId: "user_1", assigneeId: null }));
      commentCreate.mockResolvedValue(buildComment());

      await service.create("org_1", "user_1", { taskId: "task_1", content: "Self note" });

      expect(createAndPush).not.toHaveBeenCalled();
      expect(userFindUnique).not.toHaveBeenCalled();
    });

    it("sends one notification when the creator and assignee are the same user", async () => {
      taskFindFirst.mockResolvedValue(buildTaskInfo({ creatorId: "user_2", assigneeId: "user_2" }));
      commentCreate.mockResolvedValue(buildComment());
      userFindUnique.mockResolvedValue({ name: "Carol" });

      await service.create("org_1", "user_1", { taskId: "task_1", content: "Ping" });

      expect(createAndPush).toHaveBeenCalledExactlyOnceWith({
        userId: "user_2",
        type: "COMMENT_ADDED",
        payload: expect.objectContaining({ actorName: "Carol" }),
      });
    });

    it("truncates long comments into an inbox snippet", async () => {
      const longContent = "a".repeat(150);
      taskFindFirst.mockResolvedValue(buildTaskInfo({ creatorId: "user_2", assigneeId: null }));
      commentCreate.mockResolvedValue(buildComment({ content: longContent }));
      userFindUnique.mockResolvedValue({ name: "Carol" });

      await service.create("org_1", "user_1", { taskId: "task_1", content: longContent });

      expect(createAndPush).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          payload: expect.objectContaining({ commentSnippet: `${"a".repeat(120)}…` }),
        }),
      );
    });
  });

  describe("remove", () => {
    it("lets the author delete their own comment and broadcasts COMMENT_DELETED", async () => {
      commentFindFirst.mockResolvedValue(buildCommentWithTask());
      commentDelete.mockResolvedValue(buildComment());

      await service.remove("org_1", "comment_1", "user_1", "member");

      expect(commentFindFirst).toHaveBeenCalledWith({
        where: { id: "comment_1", task: { project: { organizationId: "org_1" } } },
        include: { task: { select: { projectId: true } } },
      });
      expect(commentDelete).toHaveBeenCalledWith({ where: { id: "comment_1" } });
      expect(emitToProject).toHaveBeenCalledExactlyOnceWith(
        "project_1",
        SOCKET_EVENTS.COMMENT_DELETED,
        {
          commentId: "comment_1",
          taskId: "task_1",
          projectId: "project_1",
          actorId: "user_1",
        },
      );
    });

    it("lets an admin delete someone else's comment", async () => {
      commentFindFirst.mockResolvedValue(buildCommentWithTask({ authorId: "user_2" }));
      commentDelete.mockResolvedValue(buildComment());

      await service.remove("org_1", "comment_1", "user_1", "owner");

      expect(commentDelete).toHaveBeenCalledWith({ where: { id: "comment_1" } });
      expect(emitToProject).toHaveBeenCalledTimes(1);
    });

    it("rejects a regular member deleting someone else's comment and does not broadcast", async () => {
      commentFindFirst.mockResolvedValue(buildCommentWithTask({ authorId: "user_2" }));

      await expect(service.remove("org_1", "comment_1", "user_1", "member")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(commentDelete).not.toHaveBeenCalled();
      expect(emitToProject).not.toHaveBeenCalled();
    });

    it("treats comments of another organization as not found", async () => {
      commentFindFirst.mockResolvedValue(null);

      await expect(
        service.remove("org_1", "comment_other", "user_1", "owner"),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(commentDelete).not.toHaveBeenCalled();
      expect(emitToProject).not.toHaveBeenCalled();
    });
  });
});
