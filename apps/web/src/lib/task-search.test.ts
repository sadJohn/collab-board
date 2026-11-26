import { describe, expect, it } from "vitest";

import {
  normalizeStatuses,
  summarizeBatchResults,
  taskListSearchSchema,
  toTaskListParams,
} from "./task-search";

describe("taskListSearchSchema", () => {
  it("fills in defaults for an empty search", () => {
    expect(taskListSearchSchema.parse({})).toEqual({
      q: "",
      statuses: [],
      sortBy: "updatedAt",
      sortOrder: "desc",
      page: 1,
      pageSize: 25,
    });
  });

  it("accepts the router's JSON array form and drops unknown statuses", () => {
    const parsed = taskListSearchSchema.parse({ statuses: ["TODO", "DONE", "ARCHIVED"] });

    expect(parsed.statuses).toEqual(["TODO", "DONE"]);
  });

  it("accepts a hand-written comma list", () => {
    expect(taskListSearchSchema.parse({ statuses: "BACKLOG, IN_PROGRESS" }).statuses).toEqual([
      "BACKLOG",
      "IN_PROGRESS",
    ]);
  });

  it("coerces pagination strings", () => {
    const parsed = taskListSearchSchema.parse({ page: "3", pageSize: "50" });

    expect(parsed.page).toBe(3);
    expect(parsed.pageSize).toBe(50);
  });

  it("falls back to safe values for invalid deep links", () => {
    const parsed = taskListSearchSchema.parse({
      sortBy: "position",
      sortOrder: "sideways",
      page: "0",
      pageSize: "500",
    });

    expect(parsed.sortBy).toBe("updatedAt");
    expect(parsed.sortOrder).toBe("desc");
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(25);
  });

  it("keeps a permitted sort field and order", () => {
    expect(taskListSearchSchema.parse({ sortBy: "dueDate", sortOrder: "asc" })).toEqual(
      expect.objectContaining({ sortBy: "dueDate", sortOrder: "asc" }),
    );
  });
});

describe("normalizeStatuses", () => {
  it("deduplicates and sorts statuses for a stable URL", () => {
    expect(normalizeStatuses(["TODO", "DONE", "TODO"])).toEqual(["DONE", "TODO"]);
  });
});

describe("summarizeBatchResults", () => {
  it("counts fulfilled and rejected operations", () => {
    expect(
      summarizeBatchResults([
        { status: "fulfilled", value: undefined },
        { status: "rejected", reason: new Error("boom") },
        { status: "fulfilled", value: undefined },
      ]),
    ).toEqual({ succeeded: 2, failed: 1 });
  });

  it("handles an empty result set", () => {
    expect(summarizeBatchResults([])).toEqual({ succeeded: 0, failed: 0 });
  });
});

describe("toTaskListParams", () => {
  it("omits blank filters so the server applies its defaults", () => {
    const search = taskListSearchSchema.parse({ statuses: [] });

    expect(toTaskListParams(search)).toEqual({
      q: undefined,
      statuses: undefined,
      sortBy: "updatedAt",
      sortOrder: "desc",
      page: 1,
      pageSize: 25,
    });
  });

  it("passes populated filters through", () => {
    const search = taskListSearchSchema.parse({ q: "login", statuses: ["TODO"], page: "2" });

    expect(toTaskListParams(search)).toEqual(
      expect.objectContaining({ q: "login", statuses: ["TODO"], page: 2 }),
    );
  });
});
