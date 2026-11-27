import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Comment, PrismaClient } from "@repo/db";
import { type CommentDto, type CreateCommentData, SOCKET_EVENTS } from "@repo/shared";
import { EventsService } from "../events/events.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PRISMA_CLIENT } from "../prisma/prisma.module";

/** Roles allowed to moderate (delete) any comment in the workspace. */
const MODERATOR_ROLES = new Set(["owner", "admin"]);

/** Max characters kept in the inbox comment snippet. */
const COMMENT_SNIPPET_MAX_LENGTH = 120;

/** Serializes a Prisma comment into the wire/ socket DTO (ISO timestamps). */
function toCommentDto(comment: Comment): CommentDto {
  return { ...comment, createdAt: comment.createdAt.toISOString() };
}

/** Truncates long comment text for the inbox preview. */
function toCommentSnippet(content: string): string {
  return content.length > COMMENT_SNIPPET_MAX_LENGTH
    ? `${content.slice(0, COMMENT_SNIPPET_MAX_LENGTH)}…`
    : content;
}

@Injectable()
export class CommentsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly events: EventsService,
    private readonly notifications: NotificationsService,
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

    // Notify the task creator and assignee (deduplicated, never the author).
    const recipientIds = new Set<string>();
    if (task.creatorId && task.creatorId !== authorId) {
      recipientIds.add(task.creatorId);
    }
    if (task.assigneeId && task.assigneeId !== authorId) {
      recipientIds.add(task.assigneeId);
    }

    if (recipientIds.size > 0) {
      const actorName = await this.getActorName(authorId);
      const commentSnippet = toCommentSnippet(comment.content);

      for (const recipientId of recipientIds) {
        await this.notifications
          .createAndPush({
            userId: recipientId,
            type: "COMMENT_ADDED",
            payload: {
              taskId: task.id,
              taskTitle: task.title,
              projectId: task.projectId,
              organizationId: task.organizationId,
              actorName,
              commentSnippet,
            },
          })
          .catch(() => undefined);
      }
    }

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
  ): Promise<{
    id: string;
    projectId: string;
    title: string;
    creatorId: string;
    assigneeId: string | null;
    organizationId: string;
  }> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: { organizationId } },
      select: {
        id: true,
        projectId: true,
        title: true,
        creatorId: true,
        assigneeId: true,
        project: { select: { organizationId: true } },
      },
    });

    if (!task) {
      throw new NotFoundException("任务不存在");
    }

    return {
      id: task.id,
      projectId: task.projectId,
      title: task.title,
      creatorId: task.creatorId,
      assigneeId: task.assigneeId,
      organizationId: task.project.organizationId,
    };
  }

  /** Looks up the actor's display name, falling back to their id if missing. */
  private async getActorName(actorId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: actorId },
      select: { name: true },
    });
    return user?.name ?? actorId;
  }
}
