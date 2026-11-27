import { Body, Controller, Post, UseGuards } from "@nestjs/common";
import type { PresignUploadInput, PresignUploadResponse } from "@repo/shared";
import { AuthGuard, type AuthUser } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { UploadsService } from "./uploads.service";

@Controller("uploads")
@UseGuards(AuthGuard)
export class UploadsController {
  constructor(private readonly uploadsService: UploadsService) {}

  @Post("presign")
  presign(
    @CurrentUser() user: AuthUser,
    @Body() body: PresignUploadInput,
  ): Promise<PresignUploadResponse> {
    return this.uploadsService.presign(user.id, body);
  }
}
