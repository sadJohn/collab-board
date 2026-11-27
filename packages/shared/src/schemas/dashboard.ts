import { z } from "zod";
import { taskStatusSchema } from "../enums.js";
import { taskDtoSchema } from "./dto.js";

/**
 * Read model for `GET /dashboard`.
 *
 * The endpoint never accepts an organization id: the server resolves it from
 * the session's `activeOrganizationId`, so every payload is already scoped to
 * the caller's current workspace.
 */

const countSchema = z.number().int().nonnegative();

export const dashboardStatsSchema = z.object({
  /** BACKLOG + TODO assigned to the current user. */
  assignedCount: countSchema,
  /** IN_PROGRESS assigned to the current user. */
  inProgressCount: countSchema,
  /** Past due and still open (not DONE / CANCELED). */
  overdueCount: countSchema,
  /** DONE assigned to the current user. */
  completedCount: countSchema,
});
export type DashboardStats = z.infer<typeof dashboardStatsSchema>;

export const dashboardProjectSummarySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  key: z.string(),
});
export type DashboardProjectSummary = z.infer<typeof dashboardProjectSummarySchema>;

/** "My tasks" row: a full task DTO plus the project badge information. */
export const dashboardTaskSchema = taskDtoSchema.extend({
  project: dashboardProjectSummarySchema,
});
export type DashboardTask = z.infer<typeof dashboardTaskSchema>;

/** Project progress row for the dashboard sidebar. */
export const dashboardProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  key: z.string(),
  taskCount: countSchema,
  completedCount: countSchema,
});
export type DashboardProject = z.infer<typeof dashboardProjectSchema>;

/** One slice of the workspace-wide task status donut. */
export const dashboardStatusDistributionSchema = z.object({
  status: taskStatusSchema,
  count: countSchema,
});
export type DashboardStatusDistribution = z.infer<typeof dashboardStatusDistributionSchema>;

/** One day in the seven-day created/completed trend (Asia/Shanghai bucket). */
export const dashboardTrendPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date 必须是 YYYY-MM-DD"),
  created: countSchema,
  completed: countSchema,
});
export type DashboardTrendPoint = z.infer<typeof dashboardTrendPointSchema>;

export const dashboardDtoSchema = z.object({
  stats: dashboardStatsSchema,
  myTasks: z.array(dashboardTaskSchema),
  projects: z.array(dashboardProjectSchema),
  statusDistribution: z.array(dashboardStatusDistributionSchema),
  weeklyTrend: z.array(dashboardTrendPointSchema),
});
export type DashboardDto = z.infer<typeof dashboardDtoSchema>;
