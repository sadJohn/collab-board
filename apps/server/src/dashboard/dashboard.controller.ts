import { Controller, Get, UseGuards } from "@nestjs/common";
import type { DashboardDto } from "@repo/shared";
import { AuthGuard, type AuthUser } from "../auth/auth.guard";
import { CurrentOrganization } from "../auth/current-organization.decorator";
import { CurrentUser } from "../auth/current-user.decorator";
import { OrganizationGuard } from "../auth/organization.guard";
import { DashboardService } from "./dashboard.service";

@Controller("dashboard")
@UseGuards(AuthGuard, OrganizationGuard)
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get()
  getDashboard(
    @CurrentOrganization() organizationId: string,
    @CurrentUser() user: AuthUser,
  ): Promise<DashboardDto> {
    return this.dashboardService.getDashboard(organizationId, user.id);
  }
}
