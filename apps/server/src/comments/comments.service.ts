import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Comment, PrismaClient } from "@repo/db";
import { type CommentDto, type CreateCommentData, SOCKET_EVENTS } from "@repo/shared";
import { EventsService } from "../events/events.service";
import { PRISMA_CLIENT } from "../prisma/prisma.module";

/** Roles allowed to moderate (delete) any comment in the workspace. */
const MODERATOR_ROLES = new Set(["owner", "admin"]);

/** Serializes a Prisma comment into the wire/ socket DTO (ISO timestamps). */
function toCommentDto(comment: Comment): CommentDto {
  return { ...comment, createdAt: comment.createdAt.toISOString() };
}

@Injectable()
export class CommentsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly events: EventsService,
  ) {}

  async findAll(organizationId: string, taskId: string): Promise<Comment[]> {
    await this.assertTaskInOrganization(organizationId, taskId);

    return this.prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: "asc" },
    });
  }

  async create(
    organizationId: string,
    authorId: string,
    data: CreateCommentData,
  ): Promise<Comment> {
    const task = await this.assertTaskInOrganization(organizationId, data.taskId);

    const comment = await this.prisma.comment.create({
      data: { content: data.content, taskId: data.taskId, authorId },
    });

    this.events.emitToProject(task.projectId, SOCKET_EVENTS.COMMENT_ADDED, {
      comment: toCommentDto(comment),
      projectId: task.projectId,
      actorId: authorId,
    });

    return comment;
  }

  async remove(
    organizationId: string,
    id: string,
    userId: string,
    memberRole: string,
  ): Promise<void> {
    const comment = await this.prisma.comment.findFirst({
      where: { id, task: { project: { organizationId } } },
      include: { task: { select: { projectId: true } } },
    });

    if (!comment) {
      throw new NotFoundException("评论不存在");
    }

    if (comment.authorId !== userId && !MODERATOR_ROLES.has(memberRole)) {
      throw new ForbiddenException("只有作者或管理员可以删除评论");
    }

    await this.prisma.comment.delete({ where: { id } });

    const { projectId } = comment.task;
    this.events.emitToProject(projectId, SOCKET_EVENTS.COMMENT_DELETED, {
      commentId: comment.id,
      taskId: comment.taskId,
      projectId,
      actorId: userId,
    });
  }

  private async assertTaskInOrganization(
    organizationId: string,
    taskId: string,
  ): Promise<{ id: string; projectId: string }> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: { organizationId } },
      select: { id: true, projectId: true },
    });

    if (!task) {
      throw new NotFoundException("任务不存在");
    }

    return task;
  }
}
