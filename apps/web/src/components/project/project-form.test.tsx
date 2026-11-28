import type { ProjectDto } from "@repo/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactElement } from "react";
import { toast } from "sonner";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createProject, updateProject } from "@/lib/api/projects";
import { ApiError } from "@/lib/api-client";
import i18n from "@/locales/i18n";
import { ProjectForm } from "./project-form";

vi.mock("@/lib/api/projects", () => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const createProjectMock = vi.mocked(createProject);
const updateProjectMock = vi.mocked(updateProject);
const toastError = vi.mocked(toast.error);
const toastSuccess = vi.mocked(toast.success);

const baseProject: ProjectDto = {
  id: "project_1",
  name: "Website",
  key: "WEB",
  description: "Marketing site",
  organizationId: "org_1",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

beforeAll(async () => {
  await i18n.changeLanguage("en-US");
});

beforeEach(() => {
  createProjectMock.mockReset();
  updateProjectMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

function renderForm(ui: ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

  render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);

  return { invalidateSpy };
}

function renderCreateForm() {
  const onSubmitted = vi.fn();
  const result = renderForm(
    <ProjectForm mode="create" onSubmitted={onSubmitted} organizationId="org_1" />,
  );

  return { ...result, onSubmitted };
}

function renderEditForm(project: ProjectDto = baseProject) {
  const onSubmitted = vi.fn();
  const result = renderForm(
    <ProjectForm mode="edit" onSubmitted={onSubmitted} organizationId="org_1" project={project} />,
  );

  return { ...result, onSubmitted };
}

function fillCreateForm() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Website" } });
  fireEvent.change(screen.getByLabelText("Key"), { target: { value: "WEB" } });
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Marketing site" },
  });
}

describe("ProjectForm create mode", () => {
  it("submits the project, refreshes the list and notifies the caller", async () => {
    createProjectMock.mockResolvedValue(baseProject);
    const { invalidateSpy, onSubmitted } = renderCreateForm();

    fillCreateForm();
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledTimes(1);
    });
    expect(createProjectMock).toHaveBeenCalledWith({
      name: "Website",
      key: "WEB",
      description: "Marketing site",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["organizations", "org_1", "projects"],
    });
  });

  it("maps a 409 conflict onto the key field and the duplicate-key toast", async () => {
    createProjectMock.mockRejectedValue(new ApiError(409, "Conflict"));
    const { onSubmitted } = renderCreateForm();

    fillCreateForm();
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByText("A project with this key already exists.")).toBeTruthy();
    expect(toastError).toHaveBeenCalledWith("A project with this key already exists.");
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("shows a generic message for other failures", async () => {
    createProjectMock.mockRejectedValue(new ApiError(500, "Boom"));
    renderCreateForm();

    fillCreateForm();
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Could not create the project. Try again.");
    });
  });
});

describe("ProjectForm edit mode", () => {
  it("prefills the current project values", () => {
    renderEditForm();

    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Website");
    expect(screen.getByLabelText("Key")).toHaveProperty("value", "WEB");
    expect(screen.getByLabelText("Description")).toHaveProperty("value", "Marketing site");
  });

  it("submits the edited values and refreshes the list and detail", async () => {
    updateProjectMock.mockResolvedValue({ ...baseProject, name: "Website 2" });
    const { invalidateSpy, onSubmitted } = renderEditForm();

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Website 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(onSubmitted).toHaveBeenCalledTimes(1);
    });
    expect(updateProjectMock).toHaveBeenCalledWith("project_1", {
      name: "Website 2",
      key: "WEB",
      description: "Marketing site",
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["organizations", "org_1", "projects"],
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: ["organizations", "org_1", "projects", "project_1"],
    });
  });

  it("maps a 409 conflict onto the key field", async () => {
    updateProjectMock.mockRejectedValue(new ApiError(409, "Conflict"));
    const { onSubmitted } = renderEditForm();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("A project with this key already exists.")).toBeTruthy();
    expect(onSubmitted).not.toHaveBeenCalled();
  });

  it("shows a generic message for other failures", async () => {
    updateProjectMock.mockRejectedValue(new ApiError(500, "Boom"));
    const { onSubmitted } = renderEditForm();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Could not update the project. Try again.");
    });
    expect(onSubmitted).not.toHaveBeenCalled();
  });
});
