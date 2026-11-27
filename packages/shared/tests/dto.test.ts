import { describe, expect, it } from "vitest";
import {
  commentDtoSchema,
  projectDtoSchema,
  type TaskDto,
  taskDtoSchema,
  taskPageDtoSchema,
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

const project = {
  id: "project_1",
  name: "Engineering",
  key: "ENG",
  description: null,
  organizationId: "org_1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const comment = {
  id: "comment_1",
  content: "Looks good",
  taskId: "task_1",
  authorId: "user_1",
  createdAt: "2026-01-01T00:00:00.000Z",
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

describe("taskPageDtoSchema", () => {
  it("accepts a paginated payload", () => {
    const page = { items: [task], total: 1, page: 1, pageSize: 25 };
    expect(taskPageDtoSchema.parse(page)).toEqual(page);
  });

  it("rejects negative totals and non-integer pagination", () => {
    expect(
      taskPageDtoSchema.safeParse({ items: [], total: -1, page: 1, pageSize: 25 }).success,
    ).toBe(false);
    expect(
      taskPageDtoSchema.safeParse({ items: [], total: 0, page: 0, pageSize: 25 }).success,
    ).toBe(false);
    expect(
      taskPageDtoSchema.safeParse({ items: [], total: 0, page: 1, pageSize: 1.5 }).success,
    ).toBe(false);
  });

  it("rejects items that do not match the task DTO", () => {
    expect(
      taskPageDtoSchema.safeParse({
        items: [{ ...task, position: "first" }],
        total: 1,
        page: 1,
        pageSize: 25,
      }).success,
    ).toBe(false);
  });
});

describe("projectDtoSchema", () => {
  it("accepts a serialized project", () => {
    expect(projectDtoSchema.parse(project)).toEqual(project);
  });

  it("allows a description and rejects a missing organization", () => {
    expect(projectDtoSchema.safeParse({ ...project, description: "All the things" }).success).toBe(
      true,
    );
    expect(projectDtoSchema.safeParse({ ...project, organizationId: "" }).success).toBe(false);
  });
});

describe("commentDtoSchema", () => {
  it("accepts a serialized comment", () => {
    expect(commentDtoSchema.parse(comment)).toEqual(comment);
  });

  it("rejects an invalid createdAt and empty content keys", () => {
    expect(commentDtoSchema.safeParse({ ...comment, createdAt: "not-a-date" }).success).toBe(false);
    expect(commentDtoSchema.safeParse({ ...comment, taskId: "" }).success).toBe(false);
  });
});
