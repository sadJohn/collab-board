import { describe, expect, it } from "vitest";
import {
  type DashboardDto,
  dashboardDtoSchema,
  dashboardStatsSchema,
  dashboardTaskSchema,
} from "../src/index.js";

const stats = {
  assignedCount: 2,
  inProgressCount: 1,
  overdueCount: 0,
  completedCount: 4,
};

const myTask = {
  id: "task_1",
  title: "Ship the dashboard",
  description: null,
  status: "TODO",
  priority: "HIGH",
  position: 1000,
  projectId: "project_1",
  assigneeId: "user_1",
  creatorId: "user_2",
  dueDate: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  project: { id: "project_1", name: "Engineering", key: "ENG" },
};

const dashboard: DashboardDto = {
  stats,
  myTasks: [myTask],
  projects: [{ id: "project_1", name: "Engineering", key: "ENG", taskCount: 5, completedCount: 3 }],
};

describe("dashboardStatsSchema", () => {
  it("accepts zeroed counters", () => {
    expect(
      dashboardStatsSchema.parse({
        assignedCount: 0,
        inProgressCount: 0,
        overdueCount: 0,
        completedCount: 0,
      }),
    ).toEqual({ assignedCount: 0, inProgressCount: 0, overdueCount: 0, completedCount: 0 });
  });

  it("rejects negative and non-integer counters", () => {
    expect(dashboardStatsSchema.safeParse({ ...stats, assignedCount: -1 }).success).toBe(false);
    expect(dashboardStatsSchema.safeParse({ ...stats, completedCount: 1.5 }).success).toBe(false);
  });
});

describe("dashboardTaskSchema", () => {
  it("accepts a task with its project badge", () => {
    expect(dashboardTaskSchema.parse(myTask)).toEqual(myTask);
  });

  it("rejects a task without a project", () => {
    const { project: _project, ...withoutProject } = myTask;
    expect(dashboardTaskSchema.safeParse(withoutProject).success).toBe(false);
  });
});

describe("dashboardDtoSchema", () => {
  it("accepts a full dashboard payload", () => {
    expect(dashboardDtoSchema.parse(dashboard)).toEqual(dashboard);
  });

  it("accepts an empty workspace", () => {
    const empty = {
      stats: { assignedCount: 0, inProgressCount: 0, overdueCount: 0, completedCount: 0 },
      myTasks: [],
      projects: [],
    };
    expect(dashboardDtoSchema.parse(empty)).toEqual(empty);
  });

  it("rejects negative project counts", () => {
    expect(
      dashboardDtoSchema.safeParse({
        ...dashboard,
        projects: [{ ...dashboard.projects[0], taskCount: -2 }],
      }).success,
    ).toBe(false);
  });
});
