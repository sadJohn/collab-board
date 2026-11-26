import { describe, expect, it } from "vitest";
import {
  createTaskSchema,
  MAX_PAGE_SIZE,
  moveTaskSchema,
  TASK_TITLE_MAX_LENGTH,
  taskQuerySchema,
  updateTaskSchema,
} from "../src/index.js";

const validTask = { title: "Ship phase 1", projectId: "project_1" };

describe("createTaskSchema", () => {
  it("applies status, priority and nullable-field defaults", () => {
    const parsed = createTaskSchema.parse(validTask);

    expect(parsed.status).toBe("BACKLOG");
    expect(parsed.priority).toBe("MEDIUM");
    expect(parsed.description).toBeUndefined();
    expect(parsed.assigneeId).toBeUndefined();
    expect(parsed.dueDate).toBeUndefined();
  });

  it("trims the title", () => {
    expect(createTaskSchema.parse({ ...validTask, title: "  Drag me  " }).title).toBe("Drag me");
  });

  it.each(["", "   "])("rejects blank title %j", (title) => {
    expect(createTaskSchema.safeParse({ ...validTask, title }).success).toBe(false);
  });

  it("accepts a title at the maximum length", () => {
    const title = "a".repeat(TASK_TITLE_MAX_LENGTH);
    expect(createTaskSchema.safeParse({ ...validTask, title }).success).toBe(true);
  });

  it("rejects a title over the maximum length", () => {
    const title = "a".repeat(TASK_TITLE_MAX_LENGTH + 1);
    expect(createTaskSchema.safeParse({ ...validTask, title }).success).toBe(false);
  });

  it("rejects an unknown status or priority", () => {
    expect(createTaskSchema.safeParse({ ...validTask, status: "ARCHIVED" }).success).toBe(false);
    expect(createTaskSchema.safeParse({ ...validTask, priority: "CRITICAL" }).success).toBe(false);
  });

  it("requires a project id", () => {
    expect(createTaskSchema.safeParse({ title: "No project" }).success).toBe(false);
  });

  it("coerces an ISO due date into a Date", () => {
    const parsed = createTaskSchema.parse({ ...validTask, dueDate: "2026-12-01T10:00:00.000Z" });
    expect(parsed.dueDate).toBeInstanceOf(Date);
    expect(parsed.dueDate?.toISOString()).toBe("2026-12-01T10:00:00.000Z");
  });

  it("rejects an invalid due date", () => {
    expect(createTaskSchema.safeParse({ ...validTask, dueDate: "not-a-date" }).success).toBe(false);
  });
});

describe("updateTaskSchema", () => {
  it("rejects an empty update", () => {
    expect(updateTaskSchema.safeParse({}).success).toBe(false);
  });

  it("accepts a partial update", () => {
    expect(updateTaskSchema.parse({ status: "DONE" })).toEqual({ status: "DONE" });
  });

  it("allows clearing assignee and due date", () => {
    expect(updateTaskSchema.parse({ assigneeId: null, dueDate: null })).toEqual({
      assigneeId: null,
      dueDate: null,
    });
  });

  it("still validates provided fields", () => {
    expect(updateTaskSchema.safeParse({ title: "   " }).success).toBe(false);
  });
});

describe("moveTaskSchema", () => {
  it("defaults both neighbours to null", () => {
    expect(moveTaskSchema.parse({ status: "TODO" })).toEqual({
      status: "TODO",
      previousTaskId: null,
      nextTaskId: null,
    });
  });

  it("requires a valid target status", () => {
    expect(moveTaskSchema.safeParse({ status: "ARCHIVED" }).success).toBe(false);
  });

  it("rejects identical neighbours", () => {
    expect(
      moveTaskSchema.safeParse({
        status: "TODO",
        previousTaskId: "task_1",
        nextTaskId: "task_1",
      }).success,
    ).toBe(false);
  });

  it("accepts distinct neighbours", () => {
    expect(
      moveTaskSchema.safeParse({
        status: "IN_PROGRESS",
        previousTaskId: "task_1",
        nextTaskId: null,
      }).success,
    ).toBe(true);
  });
});

describe("taskQuerySchema", () => {
  it("applies pagination and sorting defaults", () => {
    expect(taskQuerySchema.parse({})).toEqual({
      sortBy: "position",
      sortOrder: "asc",
      page: 1,
      pageSize: 25,
    });
  });

  it("coerces query strings into numbers", () => {
    const parsed = taskQuerySchema.parse({ page: "3", pageSize: "10" });
    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(10);
  });

  it("rejects an oversized page size", () => {
    expect(taskQuerySchema.safeParse({ pageSize: MAX_PAGE_SIZE + 1 }).success).toBe(false);
    expect(taskQuerySchema.safeParse({ page: 0 }).success).toBe(false);
  });

  it("validates status and priority filters", () => {
    expect(taskQuerySchema.parse({ statuses: ["TODO", "DONE"] }).statuses).toEqual([
      "TODO",
      "DONE",
    ]);
    expect(taskQuerySchema.safeParse({ statuses: ["TODO", "ARCHIVED"] }).success).toBe(false);
    expect(taskQuerySchema.safeParse({ sortBy: "unknown" }).success).toBe(false);
  });
});
