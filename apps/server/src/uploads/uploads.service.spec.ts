import { BadRequestException, InternalServerErrorException } from "@nestjs/common";
import { AVATAR_MAX_FILE_SIZE, type PresignUploadInput } from "@repo/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UploadsService } from "./uploads.service";

const mocks = vi.hoisted(() => ({
  getSignedUrl: vi.fn(),
  s3ClientConfigs: [] as unknown[],
  putCommandInputs: [] as unknown[],
}));

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: mocks.getSignedUrl,
}));

vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    constructor(config: unknown) {
      mocks.s3ClientConfigs.push(config);
    }
  },
  PutObjectCommand: class {
    constructor(input: unknown) {
      mocks.putCommandInputs.push(input);
    }
  },
}));

const storageEnv = {
  S3_ENDPOINT: "https://project.storage.supabase.co/storage/v1/s3",
  S3_REGION: "ap-northeast-1",
  S3_BUCKET: "collab-avatars",
  S3_ACCESS_KEY_ID: "test-key",
  S3_SECRET_ACCESS_KEY: "test-secret",
  S3_PUBLIC_URL: "https://project.supabase.co/storage/v1/object/public/collab-avatars",
};

const validInput: PresignUploadInput = { contentType: "image/png", size: 1024 };

beforeEach(() => {
  Object.assign(process.env, storageEnv);
  mocks.getSignedUrl.mockReset().mockResolvedValue("https://signed.example/upload");
  mocks.s3ClientConfigs.length = 0;
  mocks.putCommandInputs.length = 0;
});

afterEach(() => {
  for (const key of Object.keys(storageEnv)) {
    delete process.env[key];
  }
});

describe("UploadsService", () => {
  it("returns a presigned upload url and the matching public url", async () => {
    const service = new UploadsService();

    const result = await service.presign("user_1", validInput);

    expect(result.uploadUrl).toBe("https://signed.example/upload");
    expect(result.key).toMatch(/^avatars\/user_1\/\d+-[0-9a-f-]{36}\.png$/);
    expect(result.publicUrl).toBe(`${storageEnv.S3_PUBLIC_URL}/${result.key}`);
  });

  it("signs a PutObject command scoped to the bucket, key and content type", async () => {
    const service = new UploadsService();

    const result = await service.presign("user_1", validInput);

    expect(mocks.putCommandInputs).toEqual([
      { Bucket: storageEnv.S3_BUCKET, Key: result.key, ContentType: "image/png" },
    ]);
    expect(mocks.getSignedUrl).toHaveBeenCalledWith(expect.anything(), expect.anything(), {
      expiresIn: 300,
    });
  });

  it("creates a path-style S3 client from the environment", async () => {
    const service = new UploadsService();

    await service.presign("user_1", validInput);

    expect(mocks.s3ClientConfigs).toEqual([
      {
        endpoint: storageEnv.S3_ENDPOINT,
        region: storageEnv.S3_REGION,
        forcePathStyle: true,
        credentials: { accessKeyId: "test-key", secretAccessKey: "test-secret" },
      },
    ]);
  });

  it("rejects a content type outside the whitelist", async () => {
    const service = new UploadsService();
    const input = { contentType: "image/gif", size: 1024 } as unknown as PresignUploadInput;

    await expect(service.presign("user_1", input)).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("rejects a file over the maximum size", async () => {
    const service = new UploadsService();
    const input = {
      contentType: "image/png",
      size: AVATAR_MAX_FILE_SIZE + 1,
    } satisfies PresignUploadInput;

    await expect(service.presign("user_1", input)).rejects.toBeInstanceOf(BadRequestException);
    expect(mocks.getSignedUrl).not.toHaveBeenCalled();
  });

  it("reports the missing environment variable", async () => {
    delete process.env.S3_BUCKET;
    const service = new UploadsService();

    await expect(service.presign("user_1", validInput)).rejects.toThrow(
      InternalServerErrorException,
    );
    await expect(service.presign("user_1", validInput)).rejects.toThrow("S3_BUCKET");
  });
});
