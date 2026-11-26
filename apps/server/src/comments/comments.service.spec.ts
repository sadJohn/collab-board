import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { type Comment, prisma } from "@repo/db";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { CommentsService } from "./comments.service";

vi.mock("@repo/db", () => ({
  prisma: {
    task: { findFirst: vi.fn() },
    comment: {
      findMany: vi.fn(),
      create: vi.fn(),
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const taskFindFirst = vi.mocked(prisma.task.findFirst) as unknown as Mock<
  (args: unknown) => Promise<{ id: string } | null>
>;
const commentFindMany = vi.mocked(prisma.comment.findMany) as unknown as Mock<
  (args: unknown) => Promise<Comment[]>
>;
const commentCreate = vi.mocked(prisma.comment.create) as unknown as Mock<
  (args: unknown) => Promise<Comment>
>;
const commentFindFirst = vi.mocked(prisma.comment.findFirst) as unknown as Mock<
  (args: unknown) => Promise<Comment | null>
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

describe("CommentsService", () => {
  const service = new CommentsService(prisma);

  beforeEach(() => {
    taskFindFirst.mockReset();
    commentFindMany.mockReset();
    commentCreate.mockReset();
    commentFindFirst.mockReset();
    commentDelete.mockReset();
  });

  describe("findAll", () => {
    it("lists the comments of a task in chronological order", async () => {
      taskFindFirst.mockResolvedValue({ id: "task_1" });
      commentFindMany.mockResolvedValue([buildComment()]);

      const comments = await service.findAll("org_1", "task_1");

      expect(taskFindFirst).toHaveBeenCalledWith({
        where: { id: "task_1", project: { organizationId: "org_1" } },
        select: { id: true },
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
    it("stores the comment with the current user as author", async () => {
      taskFindFirst.mockResolvedValue({ id: "task_1" });
      commentCreate.mockResolvedValue(buildComment({ content: "Nice work" }));

      await service.create("org_1", "user_1", { taskId: "task_1", content: "Nice work" });

      expect(commentCreate).toHaveBeenCalledWith({
        data: { content: "Nice work", taskId: "task_1", authorId: "user_1" },
      });
    });

    it("rejects commenting on a task outside the organization", async () => {
      taskFindFirst.mockResolvedValue(null);

      await expect(
        service.create("org_1", "user_1", { taskId: "task_other", content: "Nice work" }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(commentCreate).not.toHaveBeenCalled();
    });
  });

  describe("remove", () => {
    it("lets the author delete their own comment", async () => {
      commentFindFirst.mockResolvedValue(buildComment());
      commentDelete.mockResolvedValue(buildComment());

      await service.remove("org_1", "comment_1", "user_1", "member");

      expect(commentFindFirst).toHaveBeenCalledWith({
        where: { id: "comment_1", task: { project: { organizationId: "org_1" } } },
      });
      expect(commentDelete).toHaveBeenCalledWith({ where: { id: "comment_1" } });
    });

    it("lets an admin delete someone else's comment", async () => {
      commentFindFirst.mockResolvedValue(buildComment({ authorId: "user_2" }));
      commentDelete.mockResolvedValue(buildComment());

      await service.remove("org_1", "comment_1", "user_1", "owner");

      expect(commentDelete).toHaveBeenCalledWith({ where: { id: "comment_1" } });
    });

    it("rejects a regular member deleting someone else's comment", async () => {
      commentFindFirst.mockResolvedValue(buildComment({ authorId: "user_2" }));

      await expect(service.remove("org_1", "comment_1", "user_1", "member")).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(commentDelete).not.toHaveBeenCalled();
    });

    it("treats comments of another organization as not found", async () => {
      commentFindFirst.mockResolvedValue(null);

      await expect(
        service.remove("org_1", "comment_other", "user_1", "owner"),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(commentDelete).not.toHaveBeenCalled();
    });
  });
});
