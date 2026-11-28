import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { PrismaClient, Project } from "@repo/db";
import type { CreateProjectData, UpdateProjectData } from "@repo/shared";
import { PRISMA_CLIENT } from "../prisma/prisma.module";
import { RedisService } from "../redis/redis.service";
import { dashboardVersionKey } from "../redis/redis-keys";

/** Roles allowed to edit or delete a project in the workspace. */
const PROJECT_MANAGER_ROLES = new Set(["owner", "admin"]);

/**
 * Prisma raises P2002 when a unique constraint is violated. Checking the code
 * (instead of `instanceof PrismaClientKnownRequestError`) keeps the service
 * unit-testable without loading the generated client runtime.
 */
function isUniqueConstraintViolation(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "P2002";
}

@Injectable()
export class ProjectsService {
  constructor(
    @Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient,
    private readonly redis: RedisService,
  ) {}

  findAll(organizationId: string): Promise<Project[]> {
    return this.prisma.project.findMany({
      where: { organizationId },
      orderBy: { createdAt: "asc" },
    });
  }

  async findOne(organizationId: string, id: string): Promise<Project> {
    const project = await this.prisma.project.findFirst({
      where: { id, organizationId },
    });

    if (!project) {
      throw new NotFoundException("项目不存在");
    }

    return project;
  }

  async create(organizationId: string, data: CreateProjectData): Promise<Project> {
    try {
      const project = await this.prisma.project.create({
        data: { ...data, organizationId },
      });
      await this.invalidateDashboard(organizationId);
      return project;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException("该项目标识在工作区内已被使用");
      }
      throw error;
    }
  }

  async update(
    organizationId: string,
    id: string,
    data: UpdateProjectData,
    memberRole: string | undefined,
  ): Promise<Project> {
    this.assertCanManage(memberRole);
    await this.findOne(organizationId, id);

    try {
      const project = await this.prisma.project.update({
        where: { id },
        data,
      });
      await this.invalidateDashboard(organizationId);
      return project;
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException("该项目标识在工作区内已被使用");
      }
      throw error;
    }
  }

  async remove(organizationId: string, id: string, memberRole: string | undefined): Promise<void> {
    this.assertCanManage(memberRole);
    await this.findOne(organizationId, id);
    await this.prisma.project.delete({ where: { id } });
    await this.invalidateDashboard(organizationId);
  }

  /** Only owners and admins may edit or delete a project. */
  private assertCanManage(memberRole: string | undefined): void {
    const isManager = memberRole?.split(",").some((role) => PROJECT_MANAGER_ROLES.has(role.trim()));

    if (!isManager) {
      throw new ForbiddenException("只有工作区所有者或管理员可以修改项目");
    }
  }

  /** Bumps the workspace dashboard version so all cached dashboards go stale. */
  private async invalidateDashboard(organizationId: string): Promise<void> {
    await this.redis.incr(dashboardVersionKey(organizationId));
  }
}
