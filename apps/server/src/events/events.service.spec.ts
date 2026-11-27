import { type NotificationDto, SOCKET_EVENTS, type TaskDto } from "@repo/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventsService, type RealtimeServer } from "./events.service";

const task: TaskDto = {
  id: "task_1",
  title: "Write docs",
  description: null,
  status: "TODO",
  priority: "MEDIUM",
  position: 1000,
  projectId: "project_1",
  assigneeId: null,
  creatorId: "user_1",
  dueDate: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("EventsService", () => {
  const emit = vi.fn();
  const to = vi.fn(() => ({ emit }));
  let service: EventsService;

  beforeEach(() => {
    emit.mockClear();
    to.mockClear();
    service = new EventsService();
    service.attachServer({ to } as unknown as RealtimeServer);
  });

  it("broadcasts a valid payload once to the project room", () => {
    const payload = { task, actorId: "user_2" };

    service.emitToProject("project_1", SOCKET_EVENTS.TASK_CREATED, payload);

    expect(to).toHaveBeenCalledExactlyOnceWith("project:project_1");
    expect(emit).toHaveBeenCalledExactlyOnceWith(SOCKET_EVENTS.TASK_CREATED, payload);
  });

  it("throws and does not broadcast an invalid payload", () => {
    expect(() =>
      service.emitToProject("project_1", SOCKET_EVENTS.TASK_CREATED, { task, actorId: "" }),
    ).toThrow();

    expect(to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("validates before the server exists and skips broadcasting", () => {
    const unbound = new EventsService();

    unbound.emitToProject("project_1", SOCKET_EVENTS.TASK_DELETED, {
      taskId: "task_1",
      projectId: "project_1",
      actorId: "user_1",
    });

    expect(to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });

  it("broadcasts a valid payload to a user's private room", () => {
    const notification: NotificationDto = {
      id: "notif_1",
      userId: "user_2",
      type: "TASK_ASSIGNED",
      payload: {
        taskId: "task_1",
        taskTitle: "Write docs",
        projectId: "project_1",
        organizationId: "org_1",
        actorName: "Alice",
      },
      readAt: null,
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    service.emitToUser("user_2", SOCKET_EVENTS.NOTIFICATION_RECEIVED, notification);

    expect(to).toHaveBeenCalledExactlyOnceWith("user:user_2");
    expect(emit).toHaveBeenCalledExactlyOnceWith(SOCKET_EVENTS.NOTIFICATION_RECEIVED, notification);
  });

  it("does not broadcast to a user room when the payload is invalid", () => {
    expect(() =>
      service.emitToUser("user_2", SOCKET_EVENTS.TASK_CREATED, { task, actorId: "" }),
    ).toThrow();

    expect(to).not.toHaveBeenCalled();
    expect(emit).not.toHaveBeenCalled();
  });
});
