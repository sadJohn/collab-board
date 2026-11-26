import { ConflictException, NotFoundException } from "@nestjs/common";
import { type Project, prisma } from "@repo/db";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
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
  const service = new ProjectsService(prisma);

  beforeEach(() => {
    findMany.mockReset();
    findFirst.mockReset();
    create.mockReset();
    update.mockReset();
    remove.mockReset();
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
  });

  it("maps duplicate project keys to 409", async () => {
    create.mockRejectedValue(
      Object.assign(new Error("Unique constraint failed"), { code: "P2002" }),
    );

    await expect(
      service.create("org_1", { name: "Collab Board", key: "CB", description: null }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it("refuses to update a project from another organization", async () => {
    findFirst.mockResolvedValue(null);

    await expect(service.update("org_1", "project_1", { name: "Renamed" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(update).not.toHaveBeenCalled();
  });

  it("deletes only after verifying the project belongs to the organization", async () => {
    findFirst.mockResolvedValue(buildProject());
    remove.mockResolvedValue(buildProject());

    await service.remove("org_1", "project_1");

    expect(findFirst).toHaveBeenCalledWith({
      where: { id: "project_1", organizationId: "org_1" },
    });
    expect(remove).toHaveBeenCalledWith({ where: { id: "project_1" } });
  });
});
