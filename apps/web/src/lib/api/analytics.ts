import { type AnalyticsDto, analyticsDtoSchema } from "@repo/shared";

import { api } from "@/lib/api-client";

/**
 * Loads the 7-day product analytics aggregation for a workspace.
 *
 * The endpoint is workspace-scoped and member-guarded on the server, so the
 * caller must pass the active organization's id.
 */
export async function getAnalytics(organizationId: string): Promise<AnalyticsDto> {
  return analyticsDtoSchema.parse(await api.get(`workspaces/${organizationId}/analytics`).json());
}
