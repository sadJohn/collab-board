import { z } from "zod";

/**
 * Strongly-typed product analytics event catalog (Phase 12).
 *
 * The web SDK may only emit these names; the server rejects anything else so
 * the event log stays queryable and the dashboard's "feature usage" breakdown
 * always maps to a known label.
 */
export const ANALYTICS_EVENTS = [
  "PAGE_VIEW",
  "TASK_CREATED",
  "TASK_DRAGGED",
  "VIEW_SWITCHED",
  "COMMAND_PALETTE_OPENED",
  "AVATAR_UPLOADED",
] as const;

export const analyticsEventNameSchema = z.enum(ANALYTICS_EVENTS);
export type AnalyticsEventName = z.infer<typeof analyticsEventNameSchema>;

const nonNegativeInt = z.number().int().nonnegative();

/**
 * A single event as sent by the browser SDK in a batch.
 *
 * `clientTimestamp` is accepted as an ISO string (or already a Date) and
 * coerced, because JSON transport turns `Date` into a string. `userId` is
 * intentionally absent here — the server injects it from the session and never
 * trusts a client-supplied id.
 */
export const analyticsTrackEventSchema = z.object({
  eventName: analyticsEventNameSchema,
  sessionId: z.string().uuid(),
  path: z.string().min(1).max(500),
  clientTimestamp: z.coerce.date(),
  properties: z.record(z.string(), z.unknown()).optional(),
  organizationId: z.string().min(1).optional(),
});
export type AnalyticsTrackEvent = z.infer<typeof analyticsTrackEventSchema>;

/** Batch payload accepted by `POST /analytics/batch` (1–50 events per request). */
export const batchTrackSchema = z.object({
  events: z.array(analyticsTrackEventSchema).min(1).max(50),
});
export type BatchTrackInput = z.infer<typeof batchTrackSchema>;

/** Accepted response returned immediately (HTTP 202) before the batch is persisted. */
export const batchTrackResponseSchema = z.object({
  accepted: z.literal(true),
  count: nonNegativeInt,
});
export type BatchTrackResponse = z.infer<typeof batchTrackResponseSchema>;

// --- Read models for `GET /workspaces/:organizationId/analytics` -----------

/** Daily active users + total event count for the selected window. */
export const analyticsSummarySchema = z.object({
  /** Distinct `userId` values with at least one event in the window. */
  dau: nonNegativeInt,
  totalEvents: nonNegativeInt,
});
export type AnalyticsSummary = z.infer<typeof analyticsSummarySchema>;

/** One row of the "feature usage" ranking. */
export const analyticsTopEventSchema = z.object({
  eventName: analyticsEventNameSchema,
  count: nonNegativeInt,
});
export type AnalyticsTopEvent = z.infer<typeof analyticsTopEventSchema>;

/** One day in the seven-day interaction trend (Asia/Shanghai bucket). */
export const analyticsTrendPointSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "date 必须是 YYYY-MM-DD"),
  events: nonNegativeInt,
  users: nonNegativeInt,
});
export type AnalyticsTrendPoint = z.infer<typeof analyticsTrendPointSchema>;

export const analyticsDtoSchema = z.object({
  summary: analyticsSummarySchema,
  topEvents: z.array(analyticsTopEventSchema),
  trend: z.array(analyticsTrendPointSchema),
});
export type AnalyticsDto = z.infer<typeof analyticsDtoSchema>;
