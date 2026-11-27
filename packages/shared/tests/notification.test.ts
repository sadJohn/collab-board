import { describe, expect, it } from "vitest";
import {
  type NotificationDto,
  type NotificationPayload,
  notificationDtoSchema,
  notificationPayloadSchema,
  notificationTypeSchema,
  SOCKET_EVENTS,
  socketPayloadSchemas,
  userRoomName,
} from "../src/index.js";

const payload: NotificationPayload = {
  taskId: "task_1",
  taskTitle: "Write release notes",
  projectId: "project_1",
  organizationId: "org_1",
  actorName: "Alice",
};

const notification: NotificationDto = {
  id: "notif_1",
  userId: "user_2",
  type: "TASK_ASSIGNED",
  payload,
  readAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("notificationTypeSchema", () => {
  it("accepts TASK_ASSIGNED and COMMENT_ADDED", () => {
    expect(notificationTypeSchema.parse("TASK_ASSIGNED")).toBe("TASK_ASSIGNED");
    expect(notificationTypeSchema.parse("COMMENT_ADDED")).toBe("COMMENT_ADDED");
  });

  it("rejects unknown notification types", () => {
    expect(notificationTypeSchema.safeParse("TASK_DELETED").success).toBe(false);
    expect(notificationTypeSchema.safeParse("").success).toBe(false);
  });
});

describe("notificationPayloadSchema", () => {
  it("accepts a payload without commentSnippet", () => {
    expect(notificationPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("accepts a payload with a comment snippet", () => {
    const withSnippet = { ...payload, commentSnippet: "Looks good to me" };
    expect(notificationPayloadSchema.parse(withSnippet)).toEqual(withSnippet);
  });

  it("accepts an explicit null commentSnippet", () => {
    const withNull = { ...payload, commentSnippet: null };
    expect(notificationPayloadSchema.parse(withNull)).toEqual(withNull);
  });

  it("rejects missing required fields", () => {
    expect(notificationPayloadSchema.safeParse({}).success).toBe(false);
    expect(notificationPayloadSchema.safeParse({ ...payload, taskId: undefined }).success).toBe(
      false,
    );
    expect(notificationPayloadSchema.safeParse({ ...payload, actorName: undefined }).success).toBe(
      false,
    );
  });

  it("rejects empty required strings", () => {
    expect(notificationPayloadSchema.safeParse({ ...payload, taskId: "" }).success).toBe(false);
    expect(notificationPayloadSchema.safeParse({ ...payload, taskTitle: "" }).success).toBe(false);
    expect(notificationPayloadSchema.safeParse({ ...payload, actorName: "" }).success).toBe(false);
    expect(notificationPayloadSchema.safeParse({ ...payload, organizationId: "" }).success).toBe(
      false,
    );
  });
});

describe("notificationDtoSchema", () => {
  it("accepts a serialized notification", () => {
    expect(notificationDtoSchema.parse(notification)).toEqual(notification);
  });

  it("accepts a read notification with an ISO readAt", () => {
    const read = { ...notification, readAt: "2026-01-02T00:00:00.000Z" };
    expect(notificationDtoSchema.parse(read)).toEqual(read);
  });

  it("rejects a non-ISO createdAt", () => {
    expect(
      notificationDtoSchema.safeParse({ ...notification, createdAt: "yesterday" }).success,
    ).toBe(false);
  });

  it("rejects a non-ISO readAt", () => {
    expect(notificationDtoSchema.safeParse({ ...notification, readAt: "tomorrow" }).success).toBe(
      false,
    );
  });

  it("rejects an unknown type", () => {
    expect(notificationDtoSchema.safeParse({ ...notification, type: "TASK_DELETED" }).success).toBe(
      false,
    );
  });

  it("rejects a malformed nested payload", () => {
    expect(
      notificationDtoSchema.safeParse({ ...notification, payload: { ...payload, taskId: "" } })
        .success,
    ).toBe(false);
  });
});

describe("user room and socket contract", () => {
  it("builds namespaced user rooms", () => {
    expect(userRoomName("user_1")).toBe("user:user_1");
  });

  it("registers NOTIFICATION_RECEIVED in the validation map", () => {
    const schema = socketPayloadSchemas[SOCKET_EVENTS.NOTIFICATION_RECEIVED];
    expect(schema).toBeDefined();
    expect(schema.parse(notification)).toEqual(notification);
    expect(schema.safeParse({ ...notification, id: "" }).success).toBe(false);
  });

  it("exposes a unique event name for notifications", () => {
    expect(SOCKET_EVENTS.NOTIFICATION_RECEIVED).toBe("notification:received");
    const names = Object.values(SOCKET_EVENTS);
    expect(new Set(names).size).toBe(names.length);
  });
});
