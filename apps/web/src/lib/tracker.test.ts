import type { AnalyticsTrackEvent } from "@repo/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Tracker } from "./tracker";

const SESSION_ID = "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed";
const TIMESTAMP = new Date("2026-01-01T00:00:00.000Z");

interface TrackerHarness {
  tracker: Tracker;
  send: ReturnType<typeof vi.fn>;
}

const createdTrackers: Tracker[] = [];

function makeTracker(overrides: Record<string, unknown> = {}): TrackerHarness {
  const send = vi.fn().mockResolvedValue({ count: 0 });
  const tracker = new Tracker({
    send,
    getPath: () => "/dashboard",
    getOrganizationId: () => "org_1",
    getSessionId: () => SESSION_ID,
    getTimestamp: () => TIMESTAMP,
    enableBeacon: false,
    ...overrides,
  });
  createdTrackers.push(tracker);
  return { tracker, send };
}

describe("Tracker", () => {
  afterEach(() => {
    vi.useRealTimers();
    while (createdTrackers.length > 0) {
      createdTrackers.pop()?.destroy();
    }
  });

  describe("buffering", () => {
    it("enriches events with session/path/org/timestamp and only includes optional fields when present", async () => {
      const { tracker, send } = makeTracker({ flushSize: 100 });

      tracker.track("PAGE_VIEW", { source: "nav" });
      tracker.track("TASK_CREATED");
      expect(tracker.buffered).toBe(2);
      expect(send).not.toHaveBeenCalled();

      await tracker.flush();

      expect(send).toHaveBeenCalledTimes(1);
      const batch = send.mock.calls[0][0] as AnalyticsTrackEvent[];
      expect(batch).toHaveLength(2);
      expect(batch[0]).toMatchObject({
        eventName: "PAGE_VIEW",
        sessionId: SESSION_ID,
        path: "/dashboard",
        organizationId: "org_1",
        properties: { source: "nav" },
      });
      expect(batch[0].clientTimestamp).toBe(TIMESTAMP);
      expect(batch[1].properties).toBeUndefined();
    });

    it("omits organizationId when the context getter returns null", async () => {
      const { tracker, send } = makeTracker({ flushSize: 100, getOrganizationId: () => null });

      tracker.track("PAGE_VIEW");
      await tracker.flush();

      const batch = send.mock.calls[0][0] as AnalyticsTrackEvent[];
      expect(batch[0].organizationId).toBeUndefined();
    });
  });

  describe("flush thresholds", () => {
    it("flushes immediately once the buffer reaches flushSize", async () => {
      const { tracker, send } = makeTracker({ flushSize: 10 });

      for (let i = 0; i < 9; i += 1) {
        tracker.track("PAGE_VIEW");
      }
      expect(tracker.buffered).toBe(9);
      expect(send).not.toHaveBeenCalled();

      tracker.track("PAGE_VIEW"); // 10th event triggers the flush
      await tracker.drain();

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toHaveLength(10);
      expect(tracker.buffered).toBe(0);
    });

    it("flushes on the interval when the buffer is below flushSize", async () => {
      vi.useFakeTimers();
      const { tracker, send } = makeTracker({ flushSize: 100, flushIntervalMs: 5000 });

      tracker.track("PAGE_VIEW");
      expect(send).not.toHaveBeenCalled();

      vi.advanceTimersByTime(5000);
      await tracker.drain();

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0]).toHaveLength(1);
      expect(tracker.buffered).toBe(0);
    });
  });

  describe("failure handling", () => {
    it("requeues a failed batch once and drops it on the second consecutive failure", async () => {
      const shouldFail = true;
      const send = vi
        .fn()
        .mockImplementation(() =>
          shouldFail ? Promise.reject(new Error("api down")) : Promise.resolve({ count: 0 }),
        );
      const { tracker } = makeTracker({ send, flushSize: 2 });

      tracker.track("PAGE_VIEW");
      tracker.track("PAGE_VIEW"); // triggers flush #1 → fails → requeue
      await tracker.drain();
      expect(send).toHaveBeenCalledTimes(1);
      expect(tracker.buffered).toBe(2);

      await tracker.flush(); // flush #2 → fails again → dropped
      expect(send).toHaveBeenCalledTimes(2);
      expect(tracker.buffered).toBe(0);
    });

    it("resets the failure flag after a successful flush, allowing a later requeue", async () => {
      let shouldFail = true;
      const send = vi
        .fn()
        .mockImplementation(() =>
          shouldFail ? Promise.reject(new Error("api down")) : Promise.resolve({ count: 0 }),
        );
      const { tracker } = makeTracker({ send, flushSize: 2 });

      tracker.track("PAGE_VIEW");
      tracker.track("PAGE_VIEW");
      await tracker.drain(); // fail → requeue
      expect(tracker.buffered).toBe(2);

      shouldFail = false;
      await tracker.flush(); // succeed → clears buffer + resets flag
      expect(tracker.buffered).toBe(0);

      shouldFail = true;
      tracker.track("PAGE_VIEW");
      tracker.track("PAGE_VIEW");
      await tracker.drain(); // fresh failure requeues again
      expect(tracker.buffered).toBe(2);
    });
  });

  describe("beacon fallback", () => {
    let originalVisibilityState: string;

    beforeEach(() => {
      originalVisibilityState = document.visibilityState;
    });

    afterEach(() => {
      Object.defineProperty(document, "visibilityState", {
        value: originalVisibilityState,
        configurable: true,
      });
    });

    it("ships the buffered tail via sendBeacon when the page is hidden", async () => {
      const sendBeacon = vi.fn();
      Object.defineProperty(navigator, "sendBeacon", {
        value: sendBeacon,
        configurable: true,
        writable: true,
      });

      const { tracker } = makeTracker({ enableBeacon: true, flushSize: 100 });
      tracker.track("PAGE_VIEW");
      tracker.track("TASK_CREATED");

      Object.defineProperty(document, "visibilityState", {
        value: "hidden",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(sendBeacon).toHaveBeenCalledTimes(1);
      const [url, blob] = sendBeacon.mock.calls[0] as [string, Blob];
      expect(url).toContain("/analytics/batch");
      expect(blob).toBeInstanceOf(Blob);

      const parsed = JSON.parse(await blob.text()) as { events: AnalyticsTrackEvent[] };
      expect(parsed.events).toHaveLength(2);
      expect(tracker.buffered).toBe(0);
    });

    it("does not flush when the page becomes visible again", () => {
      const sendBeacon = vi.fn();
      Object.defineProperty(navigator, "sendBeacon", {
        value: sendBeacon,
        configurable: true,
        writable: true,
      });

      const { tracker } = makeTracker({ enableBeacon: true, flushSize: 100 });
      tracker.track("PAGE_VIEW");

      Object.defineProperty(document, "visibilityState", {
        value: "visible",
        configurable: true,
      });
      document.dispatchEvent(new Event("visibilitychange"));

      expect(sendBeacon).not.toHaveBeenCalled();
      expect(tracker.buffered).toBe(1);
    });
  });
});
