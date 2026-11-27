import type { Prisma } from "@repo/db";
import type { JobsOptions } from "bullmq";

/** BullMQ queue name shared by the producer and the Nest processor. */
export const ANALYTICS_QUEUE = "analytics";

/** Job name for a batch of analytics events waiting to be persisted. */
export const BATCH_INSERT_JOB = "batch-insert";

/**
 * One row to insert, already enriched with the server-resolved `userId`.
 *
 * The client never sends a user id — the controller injects it from the
 * session (or `null` for anonymous events) before handing the batch to the
 * producer, so the persisted log can never be spoofed.
 */
export type AnalyticsEventCreateInput = Prisma.AnalyticsEventCreateManyInput;

/** Strictly typed payload carried by the `analytics` queue. */
export interface AnalyticsBatchJobData {
  events: AnalyticsEventCreateInput[];
}

/**
 * Analytics events are low-value and idempotent enough to retry a few times;
 * a short exponential backoff keeps a transient Neon blip from dropping data.
 */
export const ANALYTICS_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 1000 },
};
