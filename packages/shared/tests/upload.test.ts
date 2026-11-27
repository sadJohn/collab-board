import { describe, expect, it } from "vitest";
import {
  AVATAR_MAX_FILE_SIZE,
  presignUploadResponseSchema,
  presignUploadSchema,
} from "../src/index.js";

describe("presignUploadSchema", () => {
  it("accepts every whitelisted content type", () => {
    for (const contentType of ["image/jpeg", "image/png", "image/webp"]) {
      expect(presignUploadSchema.safeParse({ contentType, size: 1024 }).success).toBe(true);
    }
  });

  it("accepts a file exactly at the maximum size", () => {
    expect(
      presignUploadSchema.safeParse({ contentType: "image/png", size: AVATAR_MAX_FILE_SIZE })
        .success,
    ).toBe(true);
  });

  it("rejects a file over the maximum size", () => {
    expect(
      presignUploadSchema.safeParse({
        contentType: "image/png",
        size: AVATAR_MAX_FILE_SIZE + 1,
      }).success,
    ).toBe(false);
  });

  it("rejects content types outside the whitelist", () => {
    for (const contentType of ["image/gif", "image/svg+xml", "application/pdf"]) {
      expect(presignUploadSchema.safeParse({ contentType, size: 1024 }).success).toBe(false);
    }
  });

  it("rejects zero, negative and non-integer sizes", () => {
    for (const size of [0, -1, 1.5]) {
      expect(presignUploadSchema.safeParse({ contentType: "image/jpeg", size }).success).toBe(
        false,
      );
    }
  });

  it("rejects missing fields", () => {
    expect(presignUploadSchema.safeParse({}).success).toBe(false);
    expect(presignUploadSchema.safeParse({ contentType: "image/jpeg" }).success).toBe(false);
    expect(presignUploadSchema.safeParse({ size: 1024 }).success).toBe(false);
  });
});

describe("presignUploadResponseSchema", () => {
  it("accepts a well-formed presign response", () => {
    const response = {
      uploadUrl: "https://example.com/storage/v1/s3/avatars/user_1/avatar.png?X-Amz-Signature=abc",
      publicUrl: "https://example.com/storage/v1/object/public/collab-avatars/avatars/user_1.png",
      key: "avatars/user_1/avatar.png",
    };
    expect(presignUploadResponseSchema.parse(response)).toEqual(response);
  });

  it("rejects non-URL upload and public URLs", () => {
    expect(
      presignUploadResponseSchema.safeParse({ uploadUrl: "not-a-url", publicUrl: "not-a-url" })
        .success,
    ).toBe(false);
  });
});
