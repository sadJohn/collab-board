import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { PrismaClient, Project } from "@repo/db";
import type { CreateProjectData, UpdateProjectData } from "@repo/shared";
import { PRISMA_CLIENT } from "../prisma/prisma.module";

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
  constructor(@Inject(PRISMA_CLIENT) private readonly prisma: PrismaClient) {}

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
      return await this.prisma.project.create({
        data: { ...data, organizationId },
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException("该项目标识在工作区内已被使用");
      }
      throw error;
    }
  }

  async update(organizationId: string, id: string, data: UpdateProjectData): Promise<Project> {
    await this.findOne(organizationId, id);

    try {
      return await this.prisma.project.update({
        where: { id },
        data,
      });
    } catch (error) {
      if (isUniqueConstraintViolation(error)) {
        throw new ConflictException("该项目标识在工作区内已被使用");
      }
      throw error;
    }
  }

  async remove(organizationId: string, id: string): Promise<void> {
    await this.findOne(organizationId, id);
    await this.prisma.project.delete({ where: { id } });
  }
}
