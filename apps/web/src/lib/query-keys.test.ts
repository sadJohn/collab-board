import type { TaskStatus } from "@repo/shared";
import { describe, expect, it } from "vitest";

import { normalizeTaskListFilters, queryKeys } from "./query-keys";

describe("normalizeTaskListFilters", () => {
  it("fills in the shared defaults", () => {
    expect(normalizeTaskListFilters()).toEqual({
      q: "",
      statuses: [],
      priorities: [],
      sortBy: "position",
      sortOrder: "asc",
      page: 1,
      pageSize: 25,
    });
  });

  it("sorts multi-select filters so their order does not split the cache", () => {
    expect(
      normalizeTaskListFilters({ statuses: ["TODO", "DONE"], priorities: ["HIGH", "LOW"] }),
    ).toEqual(
      expect.objectContaining({
        statuses: ["DONE", "TODO"],
        priorities: ["HIGH", "LOW"],
      }),
    );
  });

  it("does not mutate the caller's arrays", () => {
    const statuses: TaskStatus[] = ["TODO", "DONE"];
    normalizeTaskListFilters({ statuses });

    expect(statuses).toEqual(["TODO", "DONE"]);
  });
});

describe("queryKeys", () => {
  it("keeps the same task list key regardless of status order", () => {
    const first = queryKeys.tasks.list("org_1", "project_1", { statuses: ["TODO", "DONE"] });
    const second = queryKeys.tasks.list("org_1", "project_1", { statuses: ["DONE", "TODO"] });

    expect(first).toEqual(second);
  });

  it("scopes task and member keys by organization", () => {
    expect(queryKeys.tasks.all("org_1", "project_1")).toContain("org_1");
    expect(queryKeys.members.list("org_1")).toEqual(["organizations", "org_1", "members"]);
  });
});
