import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Comment } from "@repo/db";
import { type CreateCommentData, createCommentSchema } from "@repo/shared";
import { AuthGuard, type AuthUser } from "../auth/auth.guard";
import { CurrentOrganization } from "../auth/current-organization.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { OrganizationGuard, type OrganizationRequest } from "../auth/organization.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import type { CommentsService } from "./comments.service";

@Controller()
@UseGuards(AuthGuard, OrganizationGuard)
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  @Get("tasks/:taskId/comments")
  findAll(
    @CurrentOrganization() organizationId: string,
    @Param("taskId") taskId: string,
  ): Promise<Comment[]> {
    return this.commentsService.findAll(organizationId, taskId);
  }

  @Post("comments")
  create(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createCommentSchema)) data: CreateCommentData,
  ): Promise<Comment> {
    return this.commentsService.create(organizationId, user.id, data);
  }

  @Delete("comments/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentOrganization() organizationId: string,
    @Req() request: OrganizationRequest,
    @Param("id") id: string,
  ): Promise<void> {
    await this.commentsService.remove(organizationId, id, request.user.id, request.memberRole);
  }
}
