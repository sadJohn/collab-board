import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";
import type { Project } from "@repo/db";
import {
  type CreateProjectData,
  createProjectSchema,
  type UpdateProjectData,
  updateProjectSchema,
} from "@repo/shared";
import { AuthGuard } from "../auth/auth.guard";
import { CurrentMemberRole } from "../auth/current-member-role.decorator";
import { CurrentOrganization } from "../auth/current-organization.decorator";
import { OrganizationGuard } from "../auth/organization.guard";
import { ZodValidationPipe } from "../common/zod-validation.pipe";
import { ProjectsService } from "./projects.service";

@Controller("projects")
@UseGuards(AuthGuard, OrganizationGuard)
export class ProjectsController {
  constructor(private readonly projectsService: ProjectsService) {}

  @Get()
  findAll(@CurrentOrganization() organizationId: string): Promise<Project[]> {
    return this.projectsService.findAll(organizationId);
  }

  @Get(":id")
  findOne(
    @CurrentOrganization() organizationId: string,
    @Param("id") id: string,
  ): Promise<Project> {
    return this.projectsService.findOne(organizationId, id);
  }

  @Post()
  create(
    @CurrentOrganization() organizationId: string,
    @Body(new ZodValidationPipe(createProjectSchema)) data: CreateProjectData,
  ): Promise<Project> {
    return this.projectsService.create(organizationId, data);
  }

  @Patch(":id")
  update(
    @CurrentOrganization() organizationId: string,
    @CurrentMemberRole() memberRole: string,
    @Param("id") id: string,
    @Body(new ZodValidationPipe(updateProjectSchema)) data: UpdateProjectData,
  ): Promise<Project> {
    return this.projectsService.update(organizationId, id, data, memberRole);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @CurrentOrganization() organizationId: string,
    @CurrentMemberRole() memberRole: string,
    @Param("id") id: string,
  ): Promise<void> {
    await this.projectsService.remove(organizationId, id, memberRole);
  }
}
