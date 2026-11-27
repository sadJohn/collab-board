import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const add = vi.fn();
  const close = vi.fn();
  const quit = vi.fn();
  const disconnect = vi.fn();
  const createMany = vi.fn();
  const Queue = vi.fn(function MockQueue() {
    return { add, close };
  });
  const connection = { quit, disconnect };

  return { add, close, quit, disconnect, createMany, Queue, connection };
});

vi.mock("bullmq", () => ({ Queue: mocks.Queue }));
vi.mock("../redis/redis-connection", () => ({
  createBullConnection: () => mocks.connection,
}));
vi.mock("@repo/db", () => ({
  prisma: { analyticsEvent: { createMany: mocks.createMany } },
}));

import { ANALYTICS_QUEUE, BATCH_INSERT_JOB } from "./analytics.constants";
import { analyticsQueueProducer } from "./analytics-queue.producer";

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

const originalRedisUrl = process.env.REDIS_URL;

let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.add.mockReset();
  mocks.close.mockReset();
  mocks.quit.mockReset();
  mocks.disconnect.mockReset();
  mocks.createMany.mockReset();
  mocks.Queue.mockClear();

  mocks.add.mockResolvedValue({ id: "job_1" });
  mocks.quit.mockResolvedValue("OK");
  mocks.createMany.mockResolvedValue({ count: events.length });

  logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  errorSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  warnSpy = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  warnSpy.mockRestore();
  process.env.REDIS_URL = originalRedisUrl;
});

describe("AnalyticsQueueProducer", () => {
  it("writes inline when REDIS_URL is not configured", async () => {
    delete process.env.REDIS_URL;

    await analyticsQueueProducer.enqueueBatch(events);

    expect(mocks.createMany).toHaveBeenCalledExactlyOnceWith({ data: events });
    expect(mocks.Queue).not.toHaveBeenCalled();
  });

  it("enqueues a retryable batch when REDIS_URL is configured", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";

    await analyticsQueueProducer.enqueueBatch(events);

    expect(mocks.Queue).toHaveBeenCalledWith(ANALYTICS_QUEUE, { connection: mocks.connection });
    expect(mocks.add).toHaveBeenCalledWith(
      BATCH_INSERT_JOB,
      { events },
      expect.objectContaining({ attempts: 3, backoff: { type: "exponential", delay: 1000 } }),
    );
    expect(mocks.createMany).not.toHaveBeenCalled();

    await analyticsQueueProducer.close();
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(mocks.quit).toHaveBeenCalledTimes(1);
  });

  it("falls back to a direct write when enqueueing fails", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    mocks.add.mockRejectedValue(new Error("redis down"));

    await analyticsQueueProducer.enqueueBatch(events);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("redis down"));
    expect(mocks.createMany).toHaveBeenCalledExactlyOnceWith({ data: events });
  });

  it("ignores empty batches without touching Redis or the database", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";

    await analyticsQueueProducer.enqueueBatch([]);

    expect(mocks.Queue).not.toHaveBeenCalled();
    expect(mocks.createMany).not.toHaveBeenCalled();
  });
});
