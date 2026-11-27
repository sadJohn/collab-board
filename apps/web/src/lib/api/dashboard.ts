import { type DashboardDto, dashboardDtoSchema } from "@repo/shared";

import { api } from "../api-client";

/** Loads the aggregated workspace dashboard for the active organization. */
export async function getDashboard(): Promise<DashboardDto> {
  return dashboardDtoSchema.parse(await api.get("dashboard").json());
}
