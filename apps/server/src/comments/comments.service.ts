import { ForbiddenException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Comment, PrismaClient } from "@repo/db";
import type { CreateCommentData } from "@repo/shared";
import { PRISMA_CLIENT } from "../prisma/prisma.module";

/** Roles allowed to moderate (delete) any comment in the workspace. */
const MODERATOR_ROLES = new Set(["owner", "admin"]);

@Injectable()
export class CommentsService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

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
    await this.assertTaskInOrganization(organizationId, data.taskId);

    return this.prisma.comment.create({
      data: { content: data.content, taskId: data.taskId, authorId },
    });
  }

  async remove(
    organizationId: string,
    id: string,
    userId: string,
    memberRole: string,
  ): Promise<void> {
    const comment = await this.prisma.comment.findFirst({
      where: { id, task: { project: { organizationId } } },
    });

    if (!comment) {
      throw new NotFoundException("评论不存在");
    }

    if (comment.authorId !== userId && !MODERATOR_ROLES.has(memberRole)) {
      throw new ForbiddenException("只有作者或管理员可以删除评论");
    }

    await this.prisma.comment.delete({ where: { id } });
  }

  private async assertTaskInOrganization(organizationId: string, taskId: string): Promise<void> {
    const task = await this.prisma.task.findFirst({
      where: { id: taskId, project: { organizationId } },
      select: { id: true },
    });

    if (!task) {
      throw new NotFoundException("任务不存在");
    }
  }
}
