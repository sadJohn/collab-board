import { describe, expect, it } from "vitest";
import {
  ANALYTICS_EVENTS,
  type AnalyticsTrackEvent,
  analyticsDtoSchema,
  analyticsEventNameSchema,
  analyticsTrackEventSchema,
  batchTrackResponseSchema,
  batchTrackSchema,
} from "../src/index.js";

const baseEvent: AnalyticsTrackEvent = {
  eventName: "PAGE_VIEW",
  sessionId: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  path: "/dashboard",
  clientTimestamp: new Date("2026-01-01T00:00:00.000Z"),
  properties: { from: "nav" },
  organizationId: "org_1",
};

describe("analyticsEventNameSchema", () => {
  it("accepts every catalog event", () => {
    for (const name of ANALYTICS_EVENTS) {
      expect(analyticsEventNameSchema.parse(name)).toBe(name);
    }
  });

  it("rejects unknown event names", () => {
    expect(analyticsEventNameSchema.safeParse("CLICK_BUTTON").success).toBe(false);
  });
});

describe("analyticsTrackEventSchema", () => {
  it("accepts a full event", () => {
    expect(analyticsTrackEventSchema.parse(baseEvent)).toEqual(baseEvent);
  });

  it("accepts an event without optional properties / organizationId", () => {
    const { properties: _p, organizationId: _o, ...minimal } = baseEvent;
    expect(analyticsTrackEventSchema.parse(minimal)).toEqual(minimal);
  });

  it("coerces an ISO string clientTimestamp into a Date", () => {
    const parsed = analyticsTrackEventSchema.parse({
      ...baseEvent,
      clientTimestamp: "2026-01-01T00:00:00.000Z",
    });
    expect(parsed.clientTimestamp).toBeInstanceOf(Date);
    expect(parsed.clientTimestamp.toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });

  it("rejects a malformed session id", () => {
    expect(
      analyticsTrackEventSchema.safeParse({ ...baseEvent, sessionId: "not-a-uuid" }).success,
    ).toBe(false);
  });

  it("rejects an empty path", () => {
    expect(analyticsTrackEventSchema.safeParse({ ...baseEvent, path: "" }).success).toBe(false);
  });

  it("rejects an unparseable clientTimestamp", () => {
    expect(
      analyticsTrackEventSchema.safeParse({ ...baseEvent, clientTimestamp: "nope" }).success,
    ).toBe(false);
  });
});

describe("batchTrackSchema", () => {
  it("accepts a single-event batch", () => {
    expect(batchTrackSchema.parse({ events: [baseEvent] })).toEqual({ events: [baseEvent] });
  });

  it("accepts a 50-event batch", () => {
    const events = Array.from({ length: 50 }, () => baseEvent);
    expect(batchTrackSchema.parse({ events }).events).toHaveLength(50);
  });

  it("rejects an empty batch", () => {
    expect(batchTrackSchema.safeParse({ events: [] }).success).toBe(false);
  });

  it("rejects a batch larger than 50", () => {
    const events = Array.from({ length: 51 }, () => baseEvent);
    expect(batchTrackSchema.safeParse({ events }).success).toBe(false);
  });

  it("rejects a batch containing an invalid event", () => {
    expect(
      batchTrackSchema.safeParse({ events: [{ ...baseEvent, eventName: "BOGUS" }] }).success,
    ).toBe(false);
  });
});

describe("batchTrackResponseSchema", () => {
  it("accepts an accepted response", () => {
    expect(batchTrackResponseSchema.parse({ accepted: true, count: 3 })).toEqual({
      accepted: true,
      count: 3,
    });
  });

  it("rejects accepted:false", () => {
    expect(batchTrackResponseSchema.safeParse({ accepted: false, count: 0 }).success).toBe(false);
  });
});

describe("analyticsDtoSchema", () => {
  const dto = {
    summary: { dau: 12, totalEvents: 340 },
    topEvents: [{ eventName: "TASK_DRAGGED" as const, count: 80 }],
    trend: [
      { date: "2026-01-01", events: 10, users: 3 },
      { date: "2026-01-02", events: 0, users: 0 },
    ],
  };

  it("accepts a full analytics payload", () => {
    expect(analyticsDtoSchema.parse(dto)).toEqual(dto);
  });

  it("accepts an empty workspace", () => {
    expect(
      analyticsDtoSchema.parse({ summary: { dau: 0, totalEvents: 0 }, topEvents: [], trend: [] }),
    ).toEqual({ summary: { dau: 0, totalEvents: 0 }, topEvents: [], trend: [] });
  });

  it("rejects a negative dau", () => {
    expect(
      analyticsDtoSchema.safeParse({ ...dto, summary: { ...dto.summary, dau: -1 } }).success,
    ).toBe(false);
  });

  it("rejects an invalid trend date", () => {
    expect(
      analyticsDtoSchema.safeParse({
        ...dto,
        trend: [{ date: "2026/01/01", events: 1, users: 1 }],
      }).success,
    ).toBe(false);
  });
});
