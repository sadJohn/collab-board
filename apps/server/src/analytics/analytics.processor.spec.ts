import { Logger } from "@nestjs/common";
import type { PrismaClient } from "@repo/db";
import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Prevents `@repo/db`'s top-level env validation from running; the processor
// receives a fake PrismaClient through its constructor in these tests.
vi.mock("@repo/db", () => ({ prisma: {} }));

import type { AnalyticsBatchJobData } from "./analytics.constants";
import { AnalyticsProcessor } from "./analytics.processor";

const events = [
  {
    eventName: "PAGE_VIEW",
    sessionId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
    path: "/dashboard",
    clientTimestamp: new Date("2026-01-01T00:00:00.000Z"),
    userId: "user_1",
    organizationId: "org_1",
  },
];

function buildJob(data = events): Job<AnalyticsBatchJobData> {
  return {
    id: "job_1",
    attemptsMade: 0,
    data: { events: data },
  } as unknown as Job<AnalyticsBatchJobData>;
}

describe("AnalyticsProcessor", () => {
  const createMany = vi.fn();
  const prisma = { analyticsEvent: { createMany } } as unknown as PrismaClient;
  const processor = new AnalyticsProcessor(prisma);

  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    createMany.mockReset();
    logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  it("inserts the whole batch with a single createMany call", async () => {
    createMany.mockResolvedValue({ count: events.length });

    await expect(processor.process(buildJob())).resolves.toBeUndefined();

    expect(createMany).toHaveBeenCalledExactlyOnceWith({ data: events });
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("job_1"));
  });

  it("skips empty batches without touching the database", async () => {
    await processor.process(buildJob([]));

    expect(createMany).not.toHaveBeenCalled();
  });

  it("rethrows failures so BullMQ can retry the job", async () => {
    createMany.mockRejectedValue(new Error("neon down"));

    await expect(processor.process(buildJob())).rejects.toThrow("neon down");
  });
});
