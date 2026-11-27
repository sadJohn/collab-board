import { describe, expect, it } from "vitest";
import {
  getRoomPresencePayloadSchema,
  joinProjectRoomSchema,
  presenceUserSchema,
  projectRoomName,
  roomPresenceUpdatedPayloadSchema,
  SOCKET_EVENTS,
  socketPayloadSchemas,
  type TaskDto,
  taskDtoSchema,
} from "../src/index.js";

const task: TaskDto = {
  id: "task_1",
  title: "Realtime sync",
  description: null,
  status: "TODO",
  priority: "HIGH",
  position: 1500,
  projectId: "project_1",
  assigneeId: null,
  creatorId: "user_1",
  dueDate: null,
  completedAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

describe("taskDtoSchema", () => {
  it("accepts a serialized task", () => {
    expect(taskDtoSchema.parse(task)).toEqual(task);
  });

  it("rejects a non ISO timestamp", () => {
    expect(taskDtoSchema.safeParse({ ...task, createdAt: "yesterday" }).success).toBe(false);
  });

  it("rejects an unknown status", () => {
    expect(taskDtoSchema.safeParse({ ...task, status: "ARCHIVED" }).success).toBe(false);
  });
});

describe("socket event contract", () => {
  it("uses unique event names", () => {
    const names = Object.values(SOCKET_EVENTS);
    expect(new Set(names).size).toBe(names.length);
  });

  it("builds namespaced project rooms", () => {
    expect(projectRoomName("project_1")).toBe("project:project_1");
  });

  it("validates join room payloads", () => {
    expect(joinProjectRoomSchema.parse({ projectId: "project_1" })).toEqual({
      projectId: "project_1",
    });
    expect(joinProjectRoomSchema.safeParse({ projectId: "" }).success).toBe(false);
  });

  it("validates created task payloads", () => {
    const schema = socketPayloadSchemas[SOCKET_EVENTS.TASK_CREATED];
    expect(schema.safeParse({ task, actorId: "user_2" }).success).toBe(true);
    expect(schema.safeParse({ task }).success).toBe(false);
  });

  it("validates deleted task payloads", () => {
    const schema = socketPayloadSchemas[SOCKET_EVENTS.TASK_DELETED];
    expect(
      schema.safeParse({ taskId: "task_1", projectId: "project_1", actorId: "u1" }).success,
    ).toBe(true);
    expect(schema.safeParse({ taskId: "task_1" }).success).toBe(false);
  });

  it("validates moved task payloads", () => {
    const schema = socketPayloadSchemas[SOCKET_EVENTS.TASK_MOVED];
    expect(schema.safeParse({ task, actorId: "u1", fromStatus: "BACKLOG" }).success).toBe(true);
    expect(schema.safeParse({ task, actorId: "u1", fromStatus: "ARCHIVED" }).success).toBe(false);
  });

  it("validates deleted comment payloads", () => {
    const schema = socketPayloadSchemas[SOCKET_EVENTS.COMMENT_DELETED];
    const payload = {
      commentId: "comment_1",
      taskId: "task_1",
      projectId: "project_1",
      actorId: "u1",
    };
    expect(schema.parse(payload)).toEqual(payload);
    expect(schema.safeParse({ ...payload, commentId: "" }).success).toBe(false);
    expect(schema.safeParse({ ...payload, taskId: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...payload, projectId: undefined }).success).toBe(false);
    expect(schema.safeParse({ ...payload, actorId: undefined }).success).toBe(false);
  });

  it("validates ROOM_PRESENCE_UPDATED against socketPayloadSchemas", () => {
    const schema = socketPayloadSchemas[SOCKET_EVENTS.ROOM_PRESENCE_UPDATED];
    const payload = {
      projectId: "project_1",
      users: [
        { id: "u1", name: "Alice", email: "a@b.com", image: null },
        { id: "u2", name: "Bob", email: "b@c.com", image: "https://cdn/avatar.png" },
      ],
    };
    expect(schema.parse(payload)).toEqual(payload);
    expect(schema.safeParse({ ...payload, projectId: "" }).success).toBe(false);
    expect(schema.safeParse({ ...payload, users: undefined }).success).toBe(false);
    // missing image field inside one user entry
    expect(
      schema.safeParse({
        ...payload,
        users: [{ id: "u1", name: "Alice", email: "a@b.com" }],
      }).success,
    ).toBe(false);
    // empty string id rejected
    expect(
      schema.safeParse({
        ...payload,
        users: [{ id: "", name: "Alice", email: "a@b.com", image: null }],
      }).success,
    ).toBe(false);
  });

  it("validates GET_ROOM_PRESENCE against socketPayloadSchemas", () => {
    const schema = socketPayloadSchemas[SOCKET_EVENTS.GET_ROOM_PRESENCE];
    expect(schema.parse({ projectId: "project_1" })).toEqual({ projectId: "project_1" });
    expect(schema.safeParse({ projectId: "" }).success).toBe(false);
    expect(schema.safeParse({}).success).toBe(false);
  });
});

describe("presenceUserSchema", () => {
  const validUser = {
    id: "user_1",
    name: "Alice",
    email: "alice@example.com",
    image: null,
  };

  it("accepts a full user snapshot", () => {
    expect(presenceUserSchema.parse(validUser)).toEqual(validUser);
  });

  it("accepts a user with an avatar URL", () => {
    const withImage = { ...validUser, image: "https://cdn.example.com/avatar.png" };
    expect(presenceUserSchema.parse(withImage)).toEqual(withImage);
  });

  it("rejects missing id / name / email", () => {
    expect(presenceUserSchema.safeParse({ ...validUser, id: "" }).success).toBe(false);
    expect(presenceUserSchema.safeParse({ ...validUser, name: "" }).success).toBe(false);
    expect(presenceUserSchema.safeParse({ ...validUser, email: "" }).success).toBe(false);
    expect(presenceUserSchema.safeParse({ name: "Alice", email: "a@b.com" }).success).toBe(false);
  });

  it("rejects missing image field", () => {
    const { image: _omit, ...noImage } = validUser;
    expect(presenceUserSchema.safeParse(noImage).success).toBe(false);
  });
});

describe("roomPresenceUpdatedPayloadSchema", () => {
  const alice = { id: "u1", name: "Alice", email: "a@b.com", image: null };
  const bob = { id: "u2", name: "Bob", email: "b@c.com", image: "https://cdn/bob.png" };

  it("accepts empty user list", () => {
    expect(roomPresenceUpdatedPayloadSchema.parse({ projectId: "p1", users: [] })).toEqual({
      projectId: "p1",
      users: [],
    });
  });

  it("accepts a populated list", () => {
    const payload = { projectId: "p1", users: [alice, bob] };
    expect(roomPresenceUpdatedPayloadSchema.parse(payload)).toEqual(payload);
  });

  it("rejects missing projectId", () => {
    expect(
      roomPresenceUpdatedPayloadSchema.safeParse({ projectId: "", users: [alice] }).success,
    ).toBe(false);
    expect(roomPresenceUpdatedPayloadSchema.safeParse({ users: [alice] }).success).toBe(false);
  });

  it("rejects malformed user entries inside the array", () => {
    expect(
      roomPresenceUpdatedPayloadSchema.safeParse({
        projectId: "p1",
        users: [{ id: "u1", name: "Alice" }],
      }).success,
    ).toBe(false);
  });
});

describe("getRoomPresencePayloadSchema", () => {
  it("accepts projectId", () => {
    expect(getRoomPresencePayloadSchema.parse({ projectId: "p1" })).toEqual({ projectId: "p1" });
  });

  it("rejects missing or empty projectId", () => {
    expect(getRoomPresencePayloadSchema.safeParse({}).success).toBe(false);
    expect(getRoomPresencePayloadSchema.safeParse({ projectId: "" }).success).toBe(false);
  });
});
