import type { IncomingHttpHeaders } from "node:http";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { AnalyticsDto, BatchTrackInput } from "@repo/shared";
import { batchTrackSchema } from "@repo/shared";
import { fromNodeHeaders } from "better-auth/node";

import { auth } from "../auth/auth";
import { AuthGuard, type AuthUser } from "../auth/auth.guard";
import { CurrentUser } from "../auth/current-user.decorator";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { AnalyticsService } from "./analytics.service";

@Controller()
export class AnalyticsController {
  constructor(private readonly analyticsService: AnalyticsService) {}

  /**
   * Ingests a batch of product events.
   *
   * Anonymous callers are allowed (e.g. pre-login page views): the session is
   * resolved on a best-effort basis and `userId` is `null` when absent. The
   * batch is validated by `batchTrackSchema`, enqueued for asynchronous
   * persistence, and acknowledged immediately with HTTP 202.
   */
  @Post("analytics/batch")
  @HttpCode(HttpStatus.ACCEPTED)
  async trackBatch(
    @Req() request: { headers: IncomingHttpHeaders },
    @Body(new ZodValidationPipe(batchTrackSchema)) body: BatchTrackInput,
  ): Promise<{ accepted: true; count: number }> {
    let userId: string | null = null;
    try {
      const result = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
      userId = result?.user?.id ?? null;
    } catch {
      // Session resolution must never block ingestion — anonymous is valid.
      userId = null;
    }

    const { count } = await this.analyticsService.recordBatch(body, userId);
    return { accepted: true, count };
  }

  /** Workspace-scoped product-behavior aggregation, visible to members only. */
  @Get("workspaces/:organizationId/analytics")
  @UseGuards(AuthGuard)
  getAnalytics(
    @Param("organizationId") organizationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<AnalyticsDto> {
    return this.analyticsService.getAnalytics(organizationId, user.id);
  }
}
