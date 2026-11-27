import { z } from "zod";
import { AVATAR_ALLOWED_CONTENT_TYPES, AVATAR_MAX_FILE_SIZE } from "../constants.js";

export const presignUploadSchema = z.object({
  contentType: z.enum(AVATAR_ALLOWED_CONTENT_TYPES, {
    message: `仅支持 ${AVATAR_ALLOWED_CONTENT_TYPES.join("、")} 格式的图片`,
  }),
  size: z
    .number()
    .int("文件大小必须是整数")
    .positive("文件大小必须大于 0")
    .max(AVATAR_MAX_FILE_SIZE, `文件大小不能超过 ${AVATAR_MAX_FILE_SIZE / 1024 / 1024}MB`),
});
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const presignUploadResponseSchema = z.object({
  uploadUrl: z.url(),
  publicUrl: z.url(),
  key: z.string().min(1),
});
export type PresignUploadResponse = z.infer<typeof presignUploadResponseSchema>;
