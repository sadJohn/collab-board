import {
  type CommentDto,
  type CreateCommentData,
  commentDtoSchema,
  createCommentSchema,
} from "@repo/shared";
import { z } from "zod";

import { api } from "@/lib/api-client";

const commentListSchema = z.array(commentDtoSchema);

export async function listComments(taskId: string): Promise<CommentDto[]> {
  return commentListSchema.parse(await api.get(`tasks/${taskId}/comments`).json());
}

export async function createComment(data: CreateCommentData): Promise<CommentDto> {
  const body = createCommentSchema.parse(data);
  return commentDtoSchema.parse(await api.post("comments", { json: body }).json());
}

export async function deleteComment(commentId: string): Promise<void> {
  await api.delete(`comments/${commentId}`);
}
