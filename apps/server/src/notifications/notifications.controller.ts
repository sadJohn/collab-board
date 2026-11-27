import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { NotificationDto } from "@repo/shared";
import { AuthGuard, type AuthUser } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { type NotificationListResult, NotificationsService } from "./notifications.service";

@Controller("notifications")
@UseGuards(AuthGuard)
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  findAll(@CurrentUser() user: AuthUser): Promise<NotificationListResult> {
    return this.notificationsService.findRecent(user.id);
  }

  @Patch(":id/read")
  markRead(@CurrentUser() user: AuthUser, @Param("id") id: string): Promise<NotificationDto> {
    return this.notificationsService.markRead(user.id, id);
  }

  @Post("read-all")
  @HttpCode(HttpStatus.OK)
  async markAllRead(@CurrentUser() user: AuthUser): Promise<void> {
    await this.notificationsService.markAllRead(user.id);
  }
}
