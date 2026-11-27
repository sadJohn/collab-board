import { ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { Prisma, PrismaClient } from "@repo/db";
import {
  ANALYTICS_EVENTS,
  type AnalyticsDto,
  type AnalyticsEventName,
  type BatchTrackInput,
} from "@repo/shared";

import { PRISMA_CLIENT } from "../prisma/prisma.module";
import type { AnalyticsEventCreateInput } from "./analytics.constants";
import { analyticsQueueProducer } from "./analytics-queue.producer";

/** Daily buckets are always computed in this timezone (per the Phase 12 spec). */
const TREND_TIME_ZONE = "Asia/Shanghai";
const TREND_DAYS = 7;

/** `en-CA` formats dates as `YYYY-MM-DD`, exactly what the trend series needs. */
function shanghaiDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TREND_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Last seven Shanghai calendar days, oldest first, ending with today. */
function buildRecentDayKeys(now: Date): string[] {
  const keys: string[] = [];
  for (let offset = TREND_DAYS - 1; offset >= 0; offset -= 1) {
    keys.push(shanghaiDateKey(new Date(now.getTime() - offset * 24 * 60 * 60 * 1000)));
  }
  return keys;
}

/** UTC instant for 00:00 Asia/Shanghai (UTC+8, no DST) on a `YYYY-MM-DD` day. */
function shanghaiDayStart(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00+08:00`);
}

@Injectable()
export class AnalyticsService {
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

  /**
   * Accepts a validated batch, stamps the server-resolved `userId` onto every
   * event (never trusting a client-supplied id), and hands it to the producer —
   * which enqueues it for BullMQ or writes it directly when Redis is off.
   */
  async recordBatch(input: BatchTrackInput, userId: string | null): Promise<{ count: number }> {
    const events: AnalyticsEventCreateInput[] = input.events.map((event) => ({
      eventName: event.eventName,
      sessionId: event.sessionId,
      path: event.path,
      clientTimestamp: event.clientTimestamp,
      properties: event.properties as Prisma.InputJsonValue | undefined,
      organizationId: event.organizationId ?? null,
      userId,
    }));

    await analyticsQueueProducer.enqueueBatch(events);
    return { count: events.length };
  }

  /**
   * Aggregates the product-behavior view for a workspace: 7-day DAU + total
   * events, a feature-usage ranking, and a daily events/users trend.
   *
   * Membership is verified against the path-param organization (not the
   * session's active org) because this endpoint is explicitly workspace-scoped.
   * Trend buckets follow `clientTimestamp` in Asia/Shanghai so the chart
   * reflects when the user acted, not when the server received the batch.
   */
  async getAnalytics(organizationId: string, userId: string): Promise<AnalyticsDto> {
    const member = await this.prisma.member.findUnique({
      where: { organizationId_userId: { organizationId, userId } },
      select: { id: true },
    });
    if (!member) {
      throw new ForbiddenException("无权访问该工作区");
    }

    const now = new Date();
    const dayKeys = buildRecentDayKeys(now);
    const windowStart = shanghaiDayStart(dayKeys[0]);

    const rows = await this.prisma.analyticsEvent.findMany({
      where: { organizationId, clientTimestamp: { gte: windowStart } },
      select: { eventName: true, userId: true, clientTimestamp: true },
    });

    const activeUsers = new Set<string>();
    const topCounts = new Map<string, number>();
    const eventsByDay = new Map<string, number>(dayKeys.map((day) => [day, 0]));
    const usersByDay = new Map<string, Set<string>>(dayKeys.map((day) => [day, new Set()]));

    for (const row of rows) {
      if (row.userId) {
        activeUsers.add(row.userId);
      }
      topCounts.set(row.eventName, (topCounts.get(row.eventName) ?? 0) + 1);

      const day = shanghaiDateKey(row.clientTimestamp);
      if (eventsByDay.has(day)) {
        eventsByDay.set(day, (eventsByDay.get(day) ?? 0) + 1);
        if (row.userId) {
          usersByDay.get(day)?.add(row.userId);
        }
      }
    }

    const catalog = ANALYTICS_EVENTS as readonly string[];
    const topEvents = [...topCounts.entries()]
      .filter(([name]) => catalog.includes(name))
      .sort((a, b) => b[1] - a[1])
      .map(([eventName, count]) => ({ eventName: eventName as AnalyticsEventName, count }));

    return {
      summary: { dau: activeUsers.size, totalEvents: rows.length },
      topEvents,
      trend: dayKeys.map((date) => ({
        date,
        events: eventsByDay.get(date) ?? 0,
        users: usersByDay.get(date)?.size ?? 0,
      })),
    };
  }
}
