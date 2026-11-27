import { randomUUID } from "node:crypto";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { BadRequestException, Injectable, InternalServerErrorException } from "@nestjs/common";
import {
  AVATAR_ALLOWED_CONTENT_TYPES,
  type PresignUploadInput,
  type PresignUploadResponse,
  presignUploadSchema,
} from "@repo/shared";

/** How long the browser has to upload the file before the URL expires. */
const PRESIGN_EXPIRES_IN_SECONDS = 300;

const FILE_EXTENSION: Record<(typeof AVATAR_ALLOWED_CONTENT_TYPES)[number], string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

interface StorageConfig {
  accessKeyId: string;
  bucket: string;
  endpoint: string;
  publicUrl: string;
  region: string;
  secretAccessKey: string;
}

function requireEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new InternalServerErrorException(`缺少对象存储环境变量 ${key}`);
  }
  return value;
}

@Injectable()
export class UploadsService {
  private storage?: { client: S3Client; config: StorageConfig };

  /**
   * Builds a presigned `PUT` URL so the browser uploads the binary straight to
   * the S3-compatible bucket; the file never passes through NestJS.
   */
  async presign(userId: string, input: PresignUploadInput): Promise<PresignUploadResponse> {
    const parsed = presignUploadSchema.safeParse(input);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.issues.map((issue) => issue.message).join("；"));
    }

    const { client, config } = this.getStorage();
    const extension = FILE_EXTENSION[parsed.data.contentType];
    const key = `avatars/${userId}/${Date.now()}-${randomUUID()}.${extension}`;

    const uploadUrl = await getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        ContentType: parsed.data.contentType,
      }),
      { expiresIn: PRESIGN_EXPIRES_IN_SECONDS },
    );

    return { uploadUrl, publicUrl: `${config.publicUrl}/${key}`, key };
  }

  private getStorage(): { client: S3Client; config: StorageConfig } {
    if (!this.storage) {
      const config: StorageConfig = {
        endpoint: requireEnv("S3_ENDPOINT"),
        region: requireEnv("S3_REGION"),
        bucket: requireEnv("S3_BUCKET"),
        accessKeyId: requireEnv("S3_ACCESS_KEY_ID"),
        secretAccessKey: requireEnv("S3_SECRET_ACCESS_KEY"),
        publicUrl: requireEnv("S3_PUBLIC_URL"),
      };

      this.storage = {
        config,
        client: new S3Client({
          endpoint: config.endpoint,
          region: config.region,
          forcePathStyle: true,
          credentials: {
            accessKeyId: config.accessKeyId,
            secretAccessKey: config.secretAccessKey,
          },
        }),
      };
    }

    return this.storage;
  }
}
