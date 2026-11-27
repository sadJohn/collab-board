import { NotFoundException } from "@nestjs/common";
import { type Notification, prisma } from "@repo/db";
import { type NotificationPayload, SOCKET_EVENTS } from "@repo/shared";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { EventsService } from "../events/events.service";
import { NotificationsService } from "./notifications.service";

vi.mock("@repo/db", () => {
  const notification = {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
  };
  return { prisma: { notification } };
});

const notificationCreate = vi.mocked(prisma.notification.create) as unknown as Mock<
  (args: unknown) => Promise<Notification>
>;
const notificationFindMany = vi.mocked(prisma.notification.findMany) as unknown as Mock<
  (args: unknown) => Promise<Notification[]>
>;
const notificationCount = vi.mocked(prisma.notification.count) as unknown as Mock<
  (args: unknown) => Promise<number>
>;
const notificationFindFirst = vi.mocked(prisma.notification.findFirst) as unknown as Mock<
  (args: unknown) => Promise<Notification | null>
>;
const notificationUpdate = vi.mocked(prisma.notification.update) as unknown as Mock<
  (args: unknown) => Promise<Notification>
>;
const notificationUpdateMany = vi.mocked(prisma.notification.updateMany) as unknown as Mock<
  (args: unknown) => Promise<{ count: number }>
>;

const payload: NotificationPayload = {
  taskId: "task_1",
  taskTitle: "Ship it",
  projectId: "project_1",
  organizationId: "org_1",
  actorName: "Alice",
};

function buildNotification(overrides: Partial<Notification> = {}): Notification {
  return {
    id: "notif_1",
    userId: "user_2",
    type: "TASK_ASSIGNED",
    payload,
    readAt: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  } as Notification;
}

describe("NotificationsService", () => {
  const emitToUser = vi.fn();
  const events = { emitToUser } as unknown as EventsService;
  const service = new NotificationsService(prisma, events);

  beforeEach(() => {
    notificationCreate.mockReset();
    notificationFindMany.mockReset();
    notificationCount.mockReset();
    notificationFindFirst.mockReset();
    notificationUpdate.mockReset();
    notificationUpdateMany.mockReset();
    emitToUser.mockReset();
  });

  describe("createAndPush", () => {
    it("persists the notification and pushes it to the recipient's user room", async () => {
      notificationCreate.mockResolvedValue(buildNotification());

      const dto = await service.createAndPush({
        userId: "user_2",
        type: "TASK_ASSIGNED",
        payload,
      });

      expect(notificationCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          userId: "user_2",
          type: "TASK_ASSIGNED",
          payload,
        }),
      });
      expect(emitToUser).toHaveBeenCalledExactlyOnceWith(
        "user_2",
        SOCKET_EVENTS.NOTIFICATION_RECEIVED,
        expect.objectContaining({ id: "notif_1", userId: "user_2", type: "TASK_ASSIGNED" }),
      );
      expect(dto.id).toBe("notif_1");
      expect(dto.payload).toEqual(payload);
      expect(dto.createdAt).toBe("2026-01-01T00:00:00.000Z");
    });

    it("throws and neither writes nor pushes an invalid payload", async () => {
      await expect(
        service.createAndPush({
          userId: "user_2",
          type: "TASK_ASSIGNED",
          payload: { ...payload, taskId: "" },
        }),
      ).rejects.toThrow();

      expect(notificationCreate).not.toHaveBeenCalled();
      expect(emitToUser).not.toHaveBeenCalled();
    });

    it("throws for an unknown notification type before touching the database", async () => {
      await expect(
        service.createAndPush({
          userId: "user_2",
          type: "TASK_DELETED" as never,
          payload,
        }),
      ).rejects.toThrow();

      expect(notificationCreate).not.toHaveBeenCalled();
    });
  });

  describe("findRecent", () => {
    it("returns the recent items mapped to DTOs and the unread count", async () => {
      notificationFindMany.mockResolvedValue([
        buildNotification({ id: "notif_2", createdAt: new Date("2026-01-02T00:00:00.000Z") }),
        buildNotification({ id: "notif_1" }),
      ]);
      notificationCount.mockResolvedValue(5);

      const result = await service.findRecent("user_2");

      expect(notificationFindMany).toHaveBeenCalledWith({
        where: { userId: "user_2" },
        orderBy: { createdAt: "desc" },
        take: 30,
      });
      expect(notificationCount).toHaveBeenCalledWith({
        where: { userId: "user_2", readAt: null },
      });
      expect(result.unreadCount).toBe(5);
      expect(result.items).toHaveLength(2);
      expect(result.items[0].id).toBe("notif_2");
    });
  });

  describe("markRead", () => {
    it("marks an unread notification as read", async () => {
      notificationFindFirst.mockResolvedValue(buildNotification());
      notificationUpdate.mockResolvedValue(
        buildNotification({ readAt: new Date("2026-01-03T00:00:00.000Z") }),
      );

      const dto = await service.markRead("user_2", "notif_1");

      expect(notificationFindFirst).toHaveBeenCalledWith({
        where: { id: "notif_1", userId: "user_2" },
      });
      expect(notificationUpdate).toHaveBeenCalledWith({
        where: { id: "notif_1" },
        data: { readAt: expect.any(Date) },
      });
      expect(dto.readAt).toBe("2026-01-03T00:00:00.000Z");
    });

    it("is idempotent when the notification is already read", async () => {
      notificationFindFirst.mockResolvedValue(
        buildNotification({ readAt: new Date("2026-01-03T00:00:00.000Z") }),
      );

      await service.markRead("user_2", "notif_1");

      expect(notificationUpdate).not.toHaveBeenCalled();
    });

    it("rejects marking a notification owned by another user (or missing)", async () => {
      notificationFindFirst.mockResolvedValue(null);

      await expect(service.markRead("user_other", "notif_1")).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(notificationUpdate).not.toHaveBeenCalled();
    });
  });

  describe("markAllRead", () => {
    it("updates only the current user's unread notifications", async () => {
      notificationUpdateMany.mockResolvedValue({ count: 3 });

      await service.markAllRead("user_2");

      expect(notificationUpdateMany).toHaveBeenCalledWith({
        where: { userId: "user_2", readAt: null },
        data: { readAt: expect.any(Date) },
      });
    });
  });
});
