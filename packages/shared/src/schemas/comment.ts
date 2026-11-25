import { z } from "zod";
import { COMMENT_CONTENT_MAX_LENGTH, COMMENT_CONTENT_MIN_LENGTH } from "../constants";

export const commentContentSchema = z
  .string()
  .trim()
  .min(COMMENT_CONTENT_MIN_LENGTH, `评论内容至少 ${COMMENT_CONTENT_MIN_LENGTH} 个字符`)
  .max(COMMENT_CONTENT_MAX_LENGTH, `评论内容最多 ${COMMENT_CONTENT_MAX_LENGTH} 个字符`);

export const createCommentSchema = z.object({
  taskId: z.string().min(1, "taskId 不能为空"),
  content: commentContentSchema,
});
export type CreateCommentData = z.infer<typeof createCommentSchema>;

export const updateCommentSchema = z.object({
  content: commentContentSchema,
});
export type UpdateCommentData = z.infer<typeof updateCommentSchema>;
