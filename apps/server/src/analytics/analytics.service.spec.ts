import { ForbiddenException } from "@nestjs/common";
import type { PrismaClient } from "@repo/db";
import type { AnalyticsTrackEvent, BatchTrackInput } from "@repo/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Prevents `@repo/db`'s top-level env validation from running; the service
// receives a fake PrismaClient through its constructor in these tests.
vi.mock("@repo/db", () => ({ prisma: {} }));
vi.mock("./analytics-queue.producer", () => ({
  analyticsQueueProducer: { enqueueBatch: vi.fn() },
}));

import { AnalyticsService } from "./analytics.service";
import { analyticsQueueProducer } from "./analytics-queue.producer";

const mockEnqueue = vi.mocked(analyticsQueueProducer.enqueueBatch);

const findUnique = vi.fn();
const findMany = vi.fn();
const prisma = {
  member: { findUnique },
  analyticsEvent: { findMany },
} as unknown as PrismaClient;

const now = new Date();

function trackEvent(overrides: Partial<AnalyticsTrackEvent> = {}): AnalyticsTrackEvent {
  return {
    eventName: "PAGE_VIEW",
    sessionId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
    path: "/dashboard",
    clientTimestamp: now,
    organizationId: "org_1",
    properties: { source: "nav" },
    ...overrides,
  };
}

describe("AnalyticsService.recordBatch", () => {
  const service = new AnalyticsService(prisma);

  beforeEach(() => {
    mockEnqueue.mockReset();
    mockEnqueue.mockResolvedValue(undefined);
  });

  it("injects the session userId and forwards the mapped batch to the producer", async () => {
    const input: BatchTrackInput = {
      events: [trackEvent(), trackEvent({ eventName: "TASK_CREATED" })],
    };

    const result = await service.recordBatch(input, "user_1");

    expect(result).toEqual({ count: 2 });
    expect(mockEnqueue).toHaveBeenCalledExactlyOnceWith(
      expect.arrayContaining([
        expect.objectContaining({
          eventName: "PAGE_VIEW",
          sessionId: input.events[0].sessionId,
          path: "/dashboard",
          clientTimestamp: input.events[0].clientTimestamp,
          organizationId: "org_1",
          properties: { source: "nav" },
          userId: "user_1",
        }),
        expect.objectContaining({ eventName: "TASK_CREATED", userId: "user_1" }),
      ]),
    );
  });

  it("passes userId null for anonymous batches and drops absent optional fields", async () => {
    const { properties: _p, organizationId: _o, ...minimal } = trackEvent();
    const input: BatchTrackInput = { events: [minimal] };

    await service.recordBatch(input, null);

    expect(mockEnqueue).toHaveBeenCalledWith([
      expect.objectContaining({ userId: null, organizationId: null }),
    ]);
  });
});

describe("AnalyticsService.getAnalytics", () => {
  const service = new AnalyticsService(prisma);

  beforeEach(() => {
    findUnique.mockReset();
    findMany.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("forbids non-members of the requested workspace", async () => {
    findUnique.mockResolvedValue(null);

    await expect(service.getAnalytics("org_1", "user_1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(findMany).not.toHaveBeenCalled();
  });

  it("aggregates DAU, total events, top events and a seven-day trend for members", async () => {
    findUnique.mockResolvedValue({ id: "member_1" });
    findMany.mockResolvedValue([
      { eventName: "PAGE_VIEW", userId: "user_1", clientTimestamp: now },
      { eventName: "TASK_CREATED", userId: "user_2", clientTimestamp: now },
      // Unknown event names still count toward totals but are excluded from the
      // catalog-backed feature ranking.
      { eventName: "BOGUS", userId: "user_1", clientTimestamp: now },
    ]);

    const dto = await service.getAnalytics("org_1", "user_1");

    expect(dto.summary).toEqual({ dau: 2, totalEvents: 3 });
    expect(dto.topEvents).toEqual([
      { eventName: "PAGE_VIEW", count: 1 },
      { eventName: "TASK_CREATED", count: 1 },
    ]);

    expect(dto.trend).toHaveLength(7);
    const today = dto.trend[dto.trend.length - 1];
    expect(today.events).toBe(3);
    expect(today.users).toBe(2);
    expect(dto.trend.slice(0, -1).every((day) => day.events === 0 && day.users === 0)).toBe(true);
  });

  it("returns zeroed counters and seven empty buckets for an empty workspace", async () => {
    findUnique.mockResolvedValue({ id: "member_1" });
    findMany.mockResolvedValue([]);

    const dto = await service.getAnalytics("org_1", "user_1");

    expect(dto.summary).toEqual({ dau: 0, totalEvents: 0 });
    expect(dto.topEvents).toEqual([]);
    expect(dto.trend).toHaveLength(7);
    expect(dto.trend.every((day) => day.events === 0 && day.users === 0)).toBe(true);
  });
});
