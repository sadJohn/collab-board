import { describe, expect, it } from "vitest";
import {
  COMMENT_CONTENT_MAX_LENGTH,
  createCommentSchema,
  updateCommentSchema,
} from "../src/index.js";

describe("createCommentSchema", () => {
  it("trims the content", () => {
    expect(createCommentSchema.parse({ taskId: "task_1", content: "  Looks good  " })).toEqual({
      taskId: "task_1",
      content: "Looks good",
    });
  });

  it("rejects blank content", () => {
    expect(createCommentSchema.safeParse({ taskId: "task_1", content: "   " }).success).toBe(false);
  });

  it("rejects content over the maximum length", () => {
    expect(
      createCommentSchema.safeParse({
        taskId: "task_1",
        content: "a".repeat(COMMENT_CONTENT_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });

  it("requires a task id", () => {
    expect(createCommentSchema.safeParse({ taskId: "", content: "hi" }).success).toBe(false);
  });
});

describe("updateCommentSchema", () => {
  it("accepts a non-empty content", () => {
    expect(updateCommentSchema.parse({ content: "Edited" })).toEqual({ content: "Edited" });
  });

  it("rejects blank content", () => {
    expect(updateCommentSchema.safeParse({ content: " " }).success).toBe(false);
  });
});
