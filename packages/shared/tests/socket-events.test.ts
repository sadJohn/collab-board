import { describe, expect, it } from "vitest";
import {
  joinProjectRoomSchema,
  projectRoomName,
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
});
