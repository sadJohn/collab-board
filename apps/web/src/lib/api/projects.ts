import {
  type CreateProjectData,
  createProjectSchema,
  type ProjectDto,
  projectDtoSchema,
  type UpdateProjectData,
  updateProjectSchema,
} from "@repo/shared";
import { z } from "zod";

import { api } from "@/lib/api-client";

const projectListSchema = z.array(projectDtoSchema);

/** Lists every project of the active organization. */
export async function listProjects(): Promise<ProjectDto[]> {
  return projectListSchema.parse(await api.get("projects").json());
}

export async function getProject(projectId: string): Promise<ProjectDto> {
  return projectDtoSchema.parse(await api.get(`projects/${projectId}`).json());
}

export async function createProject(data: CreateProjectData): Promise<ProjectDto> {
  const body = createProjectSchema.parse(data);
  return projectDtoSchema.parse(await api.post("projects", { json: body }).json());
}

export async function updateProject(
  projectId: string,
  data: UpdateProjectData,
): Promise<ProjectDto> {
  const body = updateProjectSchema.parse(data);
  return projectDtoSchema.parse(await api.patch(`projects/${projectId}`, { json: body }).json());
}

export async function deleteProject(projectId: string): Promise<void> {
  await api.delete(`projects/${projectId}`);
}
