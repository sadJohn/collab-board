import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { createProject } from "../../lib/api/projects";
import { ApiError } from "../../lib/api-client";
import i18n from "../../locales/i18n";
import { CreateProjectForm } from "./create-project-form";

vi.mock("../../lib/api/projects", () => ({
  createProject: vi.fn(),
}));

const createProjectMock = vi.mocked(createProject);

beforeAll(async () => {
  await i18n.changeLanguage("en-US");
});

beforeEach(() => {
  createProjectMock.mockReset();
});

function renderForm() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
  const onCreated = vi.fn();

  render(
    <QueryClientProvider client={queryClient}>
      <CreateProjectForm onCreated={onCreated} organizationId="org_1" />
    </QueryClientProvider>,
  );

  return { invalidateSpy, onCreated };
}

function fillForm() {
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Website" } });
  fireEvent.change(screen.getByLabelText("Key"), { target: { value: "WEB" } });
  fireEvent.change(screen.getByLabelText("Description"), {
    target: { value: "Marketing site" },
  });
}

describe("CreateProjectForm", () => {
  it("submits the project, refreshes the list and notifies the dialog", async () => {
    createProjectMock.mockResolvedValue({
      id: "project_1",
      name: "Website",
      key: "WEB",
      description: "Marketing site",
      organizationId: "org_1",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });
    const { invalidateSpy, onCreated } = renderForm();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
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

  it("maps a 409 conflict onto the duplicate-key message", async () => {
    createProjectMock.mockRejectedValue(new ApiError(409, "Conflict"));
    const { onCreated } = renderForm();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe("A project with this key already exists.");
    });
    expect(onCreated).not.toHaveBeenCalled();
  });

  it("shows a generic message for other failures", async () => {
    createProjectMock.mockRejectedValue(new ApiError(500, "Boom"));
    renderForm();

    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toBe(
        "Could not create the project. Try again.",
      );
    });
  });
});
