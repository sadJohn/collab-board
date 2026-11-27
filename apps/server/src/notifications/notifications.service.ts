import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Notification, Prisma, PrismaClient } from "@repo/db";
import {
  type NotificationDto,
  type NotificationPayload,
  type NotificationType,
  notificationPayloadSchema,
  notificationTypeSchema,
  SOCKET_EVENTS,
} from "@repo/shared";
import { EventsService } from "../events/events.service";
import { PRISMA_CLIENT } from "../prisma/prisma.module";

/** How many recent notifications the inbox list returns. */
const MAX_NOTIFICATIONS = 30;

export interface NotificationListResult {
  items: NotificationDto[];
  unreadCount: number;
}

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  payload: NotificationPayload;
}

/**
 * Serializes a Prisma notification (with a `Json` payload and `Date`
 * timestamps) into the wire DTO, re-validating the payload at the read boundary
 * so malformed rows never reach the client.
 */
function toNotificationDto(notification: Notification): NotificationDto {
  return {
    id: notification.id,
    userId: notification.userId,
    type: notificationTypeSchema.parse(notification.type),
    payload: notificationPayloadSchema.parse(notification.payload),
    readAt: notification.readAt?.toISOString() ?? null,
    createdAt: notification.createdAt.toISOString(),
  };
}

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly events: EventsService,
  ) {}

  /** Persists a notification and immediately pushes it to the recipient's room. */
  async createAndPush(input: CreateNotificationInput): Promise<NotificationDto> {
    const type = notificationTypeSchema.parse(input.type);
    const payload = notificationPayloadSchema.parse(input.payload);

    const created = await this.prisma.notification.create({
      data: { userId: input.userId, type, payload: payload as Prisma.InputJsonValue },
    });

    const dto = toNotificationDto(created);
    this.events.emitToUser(input.userId, SOCKET_EVENTS.NOTIFICATION_RECEIVED, dto);
    return dto;
  }

  /** Returns the most recent notifications plus the total unread count. */
  async findRecent(userId: string): Promise<NotificationListResult> {
    const [items, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: MAX_NOTIFICATIONS,
      }),
      this.prisma.notification.count({ where: { userId, readAt: null } }),
    ]);

    return { items: items.map(toNotificationDto), unreadCount };
  }

  /** Marks a single notification as read, scoped to its owner. */
  async markRead(userId: string, id: string): Promise<NotificationDto> {
    const existing = await this.prisma.notification.findFirst({
      where: { id, userId },
    });

    if (!existing) {
      throw new NotFoundException("通知不存在");
    }
    if (existing.readAt) {
      return toNotificationDto(existing);
    }

    const updated = await this.prisma.notification.update({
      where: { id: existing.id },
      data: { readAt: new Date() },
    });
    return toNotificationDto(updated);
  }

  /** Marks every unread notification of the current user as read. */
  async markAllRead(userId: string): Promise<void> {
    await this.prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
