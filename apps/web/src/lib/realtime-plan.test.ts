import { type CommentDto, SOCKET_EVENTS, type TaskDto } from "@repo/shared";
import { describe, expect, it } from "vitest";

import { planRealtimeEvent } from "./realtime-plan";

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

const comment: CommentDto = {
  id: "comment_1",
  content: "Looks good",
  taskId: "task_1",
  authorId: "user_2",
  createdAt: "2026-01-01T00:00:00.000Z",
};

describe("planRealtimeEvent", () => {
  it("invalidates the list when a task is created or updated", () => {
    expect(
      planRealtimeEvent(SOCKET_EVENTS.TASK_CREATED, { task, actorId: "user_2" }, "user_1"),
    ).toEqual({ kind: "task-upsert", task, invalidateList: true });

    expect(
      planRealtimeEvent(SOCKET_EVENTS.TASK_UPDATED, { task, actorId: "user_2" }, "user_1"),
    ).toEqual({ kind: "task-upsert", task, invalidateList: true });
  });

  it("applies moves made by other users", () => {
    expect(
      planRealtimeEvent(
        SOCKET_EVENTS.TASK_MOVED,
        { task, actorId: "user_2", fromStatus: "BACKLOG" },
        "user_1",
      ),
    ).toEqual({ kind: "task-upsert", task, invalidateList: true });
  });

  it("skips the local user's own move to avoid refetch flicker", () => {
    expect(
      planRealtimeEvent(
        SOCKET_EVENTS.TASK_MOVED,
        { task, actorId: "user_1", fromStatus: "BACKLOG" },
        "user_1",
      ),
    ).toBeNull();
  });

  it("maps task deletions", () => {
    expect(
      planRealtimeEvent(
        SOCKET_EVENTS.TASK_DELETED,
        { taskId: "task_1", projectId: "project_1", actorId: "user_2" },
        "user_1",
      ),
    ).toEqual({ kind: "task-removed", taskId: "task_1" });
  });

  it("maps comment additions to the task's comment cache", () => {
    expect(
      planRealtimeEvent(
        SOCKET_EVENTS.COMMENT_ADDED,
        { comment, projectId: "project_1", actorId: "user_2" },
        "user_1",
      ),
    ).toEqual({ kind: "comment-added", taskId: "task_1", comment });
  });

  it("maps comment deletions", () => {
    expect(
      planRealtimeEvent(
        SOCKET_EVENTS.COMMENT_DELETED,
        { commentId: "comment_1", taskId: "task_1", projectId: "project_1", actorId: "user_2" },
        "user_1",
      ),
    ).toEqual({ kind: "comment-removed", taskId: "task_1", commentId: "comment_1" });
  });

  it("ignores payloads that fail validation", () => {
    expect(planRealtimeEvent(SOCKET_EVENTS.TASK_CREATED, { task }, "user_1")).toBeNull();
    expect(planRealtimeEvent(SOCKET_EVENTS.TASK_DELETED, { taskId: "" }, "user_1")).toBeNull();
    expect(
      planRealtimeEvent(SOCKET_EVENTS.COMMENT_DELETED, { commentId: "comment_1" }, "user_1"),
    ).toBeNull();
  });
});
