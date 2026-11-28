import { ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { type Project, prisma } from "@repo/db";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import type { RedisService } from "../redis/redis.service";
import { ProjectsService } from "./projects.service";

vi.mock("@repo/db", () => ({
  prisma: {
    project: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

const findMany = vi.mocked(prisma.project.findMany) as unknown as Mock<
  (args: unknown) => Promise<Project[]>
>;
const findFirst = vi.mocked(prisma.project.findFirst) as unknown as Mock<
  (args: unknown) => Promise<Project | null>
>;
const create = vi.mocked(prisma.project.create) as unknown as Mock<
  (args: unknown) => Promise<Project>
>;
const update = vi.mocked(prisma.project.update) as unknown as Mock<
  (args: unknown) => Promise<Project>
>;
const remove = vi.mocked(prisma.project.delete) as unknown as Mock<
  (args: unknown) => Promise<Project>
>;

function buildProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "project_1",
    name: "Collab Board",
    description: null,
    key: "CB",
    organizationId: "org_1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  };
}

describe("ProjectsService", () => {
  const incr = vi.fn().mockResolvedValue(1);
  const redis = { incr } as unknown as RedisService;
  const service = new ProjectsService(prisma, redis);

  beforeEach(() => {
    findMany.mockReset();
    findFirst.mockReset();
    create.mockReset();
    update.mockReset();
    remove.mockReset();
    incr.mockReset();
    incr.mockResolvedValue(1);
  });

  it("lists only the projects of the active organization", async () => {
    findMany.mockResolvedValue([buildProject()]);

    const result = await service.findAll("org_1");

    expect(result).toHaveLength(1);
    expect(findMany).toHaveBeenCalledWith({
      where: { organizationId: "org_1" },
      orderBy: { createdAt: "asc" },
    });
  });

  it("treats projects of another organization as not found", async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.findOne("org_1", "project_1")).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "project_1", organizationId: "org_1" },
    });
  });

  it("scopes the payload to the active organization when creating", async () => {
    create.mockResolvedValue(buildProject());

    await service.create("org_1", { name: "Collab Board", key: "CB", description: null });

    expect(create).toHaveBeenCalledWith({
      data: { name: "Collab Board", key: "CB", description: null, organizationId: "org_1" },
    });
    expect(incr).toHaveBeenCalledWith("dashboard:ver:org_1");
  });

  it("maps duplicate project keys to 409", async () => {
    create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    await expect(
      service.create("org_1", { name: "Collab Board", key: "CB", description: null }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(incr).not.toHaveBeenCalled();
  });

  it("lets owners and admins update a project", async () => {
    findFirst.mockResolvedValue(buildProject());
    update.mockResolvedValue(buildProject({ name: "Renamed" }));

    await service.update("org_1", "project_1", { name: "Renamed" }, "owner");
    await service.update("org_1", "project_1", { name: "Renamed" }, "admin");

    expect(update).toHaveBeenCalledTimes(2);
    expect(incr).toHaveBeenCalledTimes(2);
  });

  it("accepts comma-separated multi-role values", async () => {
    findFirst.mockResolvedValue(buildProject());
    update.mockResolvedValue(buildProject({ name: "Renamed" }));
    remove.mockResolvedValue(buildProject());

    await service.update("org_1", "project_1", { name: "Renamed" }, "member,admin");
    await service.update("org_1", "project_1", { name: "Renamed" }, "admin, member");
    await service.remove("org_1", "project_1", "member, owner");

    expect(update).toHaveBeenCalledTimes(2);
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("rejects members updating or deleting without touching the database", async () => {
    await expect(
      service.update("org_1", "project_1", { name: "Renamed" }, "member"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove("org_1", "project_1", "member")).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(findFirst).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("fails closed for an unknown or missing role", async () => {
    await expect(
      service.update("org_1", "project_1", { name: "Renamed" }, "unknown"),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      service.update("org_1", "project_1", { name: "Renamed" }, undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.remove("org_1", "project_1", undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );

    expect(findFirst).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
    expect(remove).not.toHaveBeenCalled();
  });

  it("refuses to update a project from another organization", async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.update("org_1", "project_1", { name: "Renamed" }, "owner"),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(update).not.toHaveBeenCalled();
  });

  it("lets owners and admins delete after verifying the organization", async () => {
    findFirst.mockResolvedValue(buildProject());
    remove.mockResolvedValue(buildProject());

    await service.remove("org_1", "project_1", "owner");
    await service.remove("org_1", "project_1", "admin");

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "project_1", organizationId: "org_1" },
    });
    expect(remove).toHaveBeenCalledWith({ where: { id: "project_1" } });
    expect(incr).toHaveBeenCalledTimes(2);
  });

  it("keeps a project from another organization hidden when deleting", async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.remove("org_1", "project_1", "owner")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(remove).not.toHaveBeenCalled();
  });
});
