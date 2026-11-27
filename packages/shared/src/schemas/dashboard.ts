import { z } from "zod";
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

export const dashboardDtoSchema = z.object({
  stats: dashboardStatsSchema,
  myTasks: z.array(dashboardTaskSchema),
  projects: z.array(dashboardProjectSchema),
});
export type DashboardDto = z.infer<typeof dashboardDtoSchema>;
