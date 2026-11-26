import type { TaskDto, TaskStatus } from "@repo/shared";
import { describe, expect, it } from "vitest";

import { planTaskMove } from "./task-board";

function makeTask(id: string, status: TaskStatus, position: number): TaskDto {
  return {
    id,
    title: `Task ${id}`,
    description: null,
    status,
    priority: "MEDIUM",
    position,
    projectId: "project_1",
    assigneeId: null,
    creatorId: "user_1",
    dueDate: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("planTaskMove", () => {
  it("appends to the end when dropping on an empty column", () => {
    const tasks = [makeTask("a", "TODO", 1000)];

    const plan = planTaskMove(tasks, "a", { type: "column", status: "DONE" });

    expect(plan).toMatchObject({
      status: "DONE",
      previousTaskId: null,
      nextTaskId: null,
      position: 1000,
      rebalanceRequired: false,
    });
  });

  it("moves across columns and appends after the existing cards", () => {
    const tasks = [
      makeTask("a", "TODO", 1000),
      makeTask("b", "TODO", 3000),
      makeTask("c", "DONE", 5000),
    ];

    const plan = planTaskMove(tasks, "a", { type: "column", status: "DONE" });

    expect(plan).toMatchObject({
      status: "DONE",
      previousTaskId: "c",
      nextTaskId: null,
      position: 6000,
    });
    expect(plan?.tasks.find((task) => task.id === "a")).toMatchObject({
      status: "DONE",
      position: 6000,
    });
  });

  it("inserts at the head when dropping on the first card", () => {
    const tasks = [makeTask("a", "TODO", 1000), makeTask("c", "DONE", 5000)];

    const plan = planTaskMove(tasks, "a", { type: "task", taskId: "c" });

    expect(plan).toMatchObject({
      status: "DONE",
      previousTaskId: null,
      nextTaskId: "c",
      position: 4000,
    });
  });

  it("inserts between two cards using the shared midpoint", () => {
    const tasks = [
      makeTask("a", "TODO", 1000),
      makeTask("c", "DONE", 5000),
      makeTask("d", "DONE", 7000),
    ];

    const plan = planTaskMove(tasks, "a", { type: "task", taskId: "d" });

    expect(plan).toMatchObject({
      status: "DONE",
      previousTaskId: "c",
      nextTaskId: "d",
      position: 6000,
    });
  });

  it("flags a rebalance when the neighbour gap is too small", () => {
    const tasks = [
      makeTask("a", "TODO", 1000),
      makeTask("c", "DONE", 5000),
      makeTask("d", "DONE", 5000.005),
    ];

    const plan = planTaskMove(tasks, "a", { type: "task", taskId: "d" });

    expect(plan?.rebalanceRequired).toBe(true);
    expect(plan?.position).toBeCloseTo(5000.0025);
  });

  it("lands after the hovered card when moving down inside a column", () => {
    const tasks = [
      makeTask("a", "TODO", 1000),
      makeTask("b", "TODO", 2000),
      makeTask("c", "TODO", 3000),
    ];

    const plan = planTaskMove(tasks, "a", { type: "task", taskId: "c" });

    expect(plan).toMatchObject({
      previousTaskId: "c",
      nextTaskId: null,
      position: 4000,
    });
  });

  it("lands before the hovered card when moving up inside a column", () => {
    const tasks = [
      makeTask("a", "TODO", 1000),
      makeTask("b", "TODO", 2000),
      makeTask("c", "TODO", 3000),
    ];

    const plan = planTaskMove(tasks, "c", { type: "task", taskId: "a" });

    expect(plan).toMatchObject({
      previousTaskId: null,
      nextTaskId: "a",
      position: 0,
    });
  });

  it("keeps the original list untouched so onError can restore it", () => {
    const tasks = [makeTask("a", "TODO", 1000), makeTask("c", "DONE", 5000)];
    const snapshot = tasks.map((task) => ({ ...task }));

    const plan = planTaskMove(tasks, "a", { type: "task", taskId: "c" });

    expect(tasks).toEqual(snapshot);
    expect(plan?.tasks).not.toBe(tasks);
    expect(plan?.tasks[0]).not.toBe(tasks[0]);
  });

  it("ignores a drop on itself or an unknown task", () => {
    const tasks = [makeTask("a", "TODO", 1000)];

    expect(planTaskMove(tasks, "a", { type: "task", taskId: "a" })).toBeNull();
    expect(planTaskMove(tasks, "missing", { type: "column", status: "DONE" })).toBeNull();
    expect(planTaskMove(tasks, "a", { type: "task", taskId: "missing" })).toBeNull();
  });
});
