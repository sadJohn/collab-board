import type { AnalyticsEventName, AnalyticsTrackEvent } from "@repo/shared";

import { queryClient } from "./query-client";
import { sessionQueryOptions } from "./session";

/**
 * Lightweight product-analytics tracker (Phase 12).
 *
 * - Buffers events in memory and flushes in batches of `flushSize` (default 10)
 *   or every `flushIntervalMs` (default 5s).
 * - On `visibilitychange` → hidden it flushes the remainder with
 *   `navigator.sendBeacon` so a page unload never drops the tail.
 * - A failed batch is requeued to the front of the buffer exactly once; a
 *   second consecutive failure drops it so a down API can't loop forever.
 *
 * The default singleton reads the active organization from the React Query
 * session cache and the path from `window.location`, so callers only pass the
 * event name and optional properties: `tracker.track("TASK_CREATED")`.
 */

const SESSION_STORAGE_KEY = "collab.analytics.sessionId";
const DEFAULT_FLUSH_SIZE = 10;
const DEFAULT_FLUSH_INTERVAL_MS = 5000;

export type AnalyticsProperties = Record<string, unknown>;

export interface TrackerSendResult {
  count: number;
}

export interface TrackerOptions {
  /** Transport override — tests inject a mock here. */
  send?: (events: AnalyticsTrackEvent[]) => Promise<TrackerSendResult>;
  flushSize?: number;
  flushIntervalMs?: number;
  getPath?: () => string;
  getOrganizationId?: () => string | null;
  getSessionId?: () => string;
  getTimestamp?: () => Date;
  /** Attach the visibilitychange beacon listener. Defaults to true in browsers. */
  enableBeacon?: boolean;
}

function generateSessionId(): string {
  const cryptoObj = globalThis.crypto;
  if (cryptoObj && typeof cryptoObj.randomUUID === "function") {
    return cryptoObj.randomUUID();
  }
  return `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/** Survives reloads in the same tab but starts fresh for a new tab/session. */
function readOrCreateSessionId(): string {
  try {
    const existing = window.sessionStorage.getItem(SESSION_STORAGE_KEY);
    if (existing) {
      return existing;
    }
  } catch {
    // sessionStorage can be unavailable (private mode / SSR) — fall through.
  }

  const id = generateSessionId();
  try {
    window.sessionStorage.setItem(SESSION_STORAGE_KEY, id);
  } catch {
    // Non-fatal: the in-memory id is still unique for this page load.
  }
  return id;
}

function readActiveOrganizationId(): string | null {
  const session = queryClient.getQueryData<{ activeOrganizationId?: string | null }>(
    sessionQueryOptions.queryKey,
  );
  return session?.activeOrganizationId ?? null;
}

const API_BASE = (import.meta.env.VITE_API_URL ?? "http://localhost:3000").replace(/\/$/, "");
const BATCH_URL = `${API_BASE}/analytics/batch`;

async function defaultSend(events: AnalyticsTrackEvent[]): Promise<TrackerSendResult> {
  const response = await fetch(BATCH_URL, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events }),
  });
  if (!response.ok) {
    throw new Error(`analytics batch failed: ${response.status}`);
  }
  const json = (await response.json()) as { count?: number };
  return { count: typeof json.count === "number" ? json.count : events.length };
}

export class Tracker {
  private readonly buffer: AnalyticsTrackEvent[] = [];
  private readonly flushSize: number;
  private readonly flushIntervalMs: number;
  private readonly send: (events: AnalyticsTrackEvent[]) => Promise<TrackerSendResult>;
  private readonly getPath: () => string;
  private readonly getOrganizationId: () => string | null;
  private readonly sessionId: string;
  private readonly getTimestamp: () => Date;

  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private pending: Promise<void> | null = null;
  private flushing = false;
  private lastBatchFailed = false;

  constructor(options: TrackerOptions = {}) {
    this.flushSize = options.flushSize ?? DEFAULT_FLUSH_SIZE;
    this.flushIntervalMs = options.flushIntervalMs ?? DEFAULT_FLUSH_INTERVAL_MS;
    this.send = options.send ?? defaultSend;
    this.getPath = options.getPath ?? (() => window.location.pathname);
    this.getOrganizationId = options.getOrganizationId ?? readActiveOrganizationId;
    this.sessionId = (options.getSessionId ?? readOrCreateSessionId)();
    this.getTimestamp = options.getTimestamp ?? (() => new Date());

    this.startTimer();
    if (options.enableBeacon !== false) {
      this.attachBeacon();
    }
  }

  /** Buffers an event; triggers an immediate flush once the batch fills up. */
  track(eventName: AnalyticsEventName, properties?: AnalyticsProperties): void {
    const organizationId = this.getOrganizationId();
    const event: AnalyticsTrackEvent = {
      eventName,
      sessionId: this.sessionId,
      path: this.getPath(),
      clientTimestamp: this.getTimestamp(),
      ...(properties ? { properties } : {}),
      ...(organizationId ? { organizationId } : {}),
    };
    this.buffer.push(event);
    if (this.buffer.length >= this.flushSize) {
      this.scheduleFlush();
    }
  }

  /** Number of events currently buffered (exposed for tests). */
  get buffered(): number {
    return this.buffer.length;
  }

  /** Awaits any in-flight flush — used by tests to make flushing deterministic. */
  async drain(): Promise<void> {
    await this.pending;
  }

  /** Flushes whatever is currently buffered; safe to call externally. */
  flush(): Promise<void> {
    return this.scheduleFlush();
  }

  /** Clears the flush timer and beacon listener — for tests / HMR teardown. */
  destroy(): void {
    if (this.flushTimer !== null) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
    if (typeof document !== "undefined" && typeof document.removeEventListener === "function") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  private scheduleFlush(): Promise<void> {
    if (this.pending) {
      return this.pending;
    }
    this.pending = this.flushBatch().finally(() => {
      this.pending = null;
    });
    return this.pending;
  }

  private async flushBatch(): Promise<void> {
    if (this.flushing) {
      return;
    }
    this.flushing = true;
    try {
      const batch = this.buffer.splice(0, this.flushSize);
      if (batch.length === 0) {
        return;
      }
      try {
        await this.send(batch);
        this.lastBatchFailed = false;
      } catch {
        if (!this.lastBatchFailed) {
          // Retry once by putting the batch back at the front of the buffer.
          this.buffer.unshift(...batch);
          this.lastBatchFailed = true;
        }
        // A second consecutive failure drops the batch to avoid an infinite loop.
      }
    } finally {
      this.flushing = false;
    }
  }

  private startTimer(): void {
    if (typeof window === "undefined") {
      return;
    }
    const handle = setInterval(() => {
      void this.scheduleFlush();
    }, this.flushIntervalMs);

    // In Node/jsdom the handle is an object with `unref()`; calling it lets an
    // idle tracker's interval expire without keeping the test process alive.
    if (typeof handle === "object" && handle !== null && "unref" in handle) {
      (handle as { unref: () => void }).unref();
    }
    this.flushTimer = handle;
  }

  private attachBeacon(): void {
    if (typeof document === "undefined" || typeof document.addEventListener !== "function") {
      return;
    }
    document.addEventListener("visibilitychange", this.handleVisibilityChange);
  }

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState !== "hidden") {
      return;
    }
    this.flushBeacon();
  };

  /** Final attempt to ship the buffer before the page unloads. */
  private flushBeacon(): void {
    if (this.buffer.length === 0) {
      return;
    }
    const events = this.buffer.splice(0);
    const body = JSON.stringify({ events });

    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      try {
        navigator.sendBeacon(BATCH_URL, new Blob([body], { type: "application/json" }));
        return;
      } catch {
        // Fall through to keepalive fetch.
      }
    }

    void fetch(BATCH_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body,
      keepalive: true,
    }).catch(() => undefined);
  }
}

export function createTracker(options: TrackerOptions = {}): Tracker {
  return new Tracker(options);
}

/** App-wide singleton. Import and call `tracker.track(...)` from anywhere. */
export const tracker = createTracker();
