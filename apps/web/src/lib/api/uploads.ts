import { presignUploadResponseSchema, presignUploadSchema } from "@repo/shared";
import ky from "ky";

import { api } from "../api-client";
import { authClient } from "../auth-client";
import { queryClient } from "../query-client";
import { queryKeys } from "../query-keys";

/**
 * Uploads an avatar and stores its public URL on the current user.
 *
 * The binary never touches NestJS: the API only signs a key, then the file is
 * PUT straight to object storage. That PUT must not reuse `api` — its `prefix`
 * would rewrite the storage origin and `credentials: "include"` would drag
 * cookies into the cross-origin request, breaking the signature.
 */
export async function uploadAvatar(file: File, name?: string): Promise<string> {
  const body = presignUploadSchema.parse({ contentType: file.type, size: file.size });
  const { uploadUrl, publicUrl } = presignUploadResponseSchema.parse(
    await api.post("uploads/presign", { json: body }).json(),
  );

  // Dedicated, credential-free client: signed URLs must be uploaded verbatim.
  await ky.put(uploadUrl, {
    body: file,
    credentials: "omit",
    headers: { "Content-Type": file.type },
    retry: 0,
  });

  const { error } = await authClient.updateUser({
    image: publicUrl,
    ...(name ? { name } : {}),
  });

  if (error) {
    throw new Error(error.message || error.statusText);
  }

  await queryClient.invalidateQueries({ queryKey: queryKeys.session });

  return publicUrl;
}
