import type { ProjectDto } from "@repo/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { deleteProject } from "@/lib/api/projects";
import { ApiError } from "@/lib/api-client";
import i18n from "@/locales/i18n";
import { useUiStore } from "@/stores/ui-store";
import { DeleteProjectDialog } from "./delete-project-dialog";

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => navigateMock,
}));

vi.mock("@/lib/api/projects", () => ({
  deleteProject: vi.fn(),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const deleteProjectMock = vi.mocked(deleteProject);
const toastError = vi.mocked(toast.error);
const toastSuccess = vi.mocked(toast.success);

const project: ProjectDto = {
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
  deleteProjectMock.mockReset();
  navigateMock.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
  useUiStore.getState().setActiveTaskId(null);
});

function renderDialog() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const removeSpy = vi.spyOn(queryClient, "removeQueries");
  const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

  render(
    <QueryClientProvider client={queryClient}>
      <DeleteProjectDialog project={project} />
    </QueryClientProvider>,
  );

  fireEvent.click(screen.getByRole("button", { name: "Delete project" }));

  return { removeSpy, invalidateSpy };
}

function confirmKey(value = "WEB") {
  fireEvent.change(screen.getByLabelText("Project key"), { target: { value } });
}

describe("DeleteProjectDialog", () => {
  it("does not submit a mismatched key", () => {
    renderDialog();
    confirmKey("wrong");

    const submit = screen.getByRole("button", { name: "Permanently delete" });
    expect(submit).toHaveProperty("disabled", true);

    fireEvent.submit(screen.getByRole("form", { name: "Delete project confirmation" }));
    expect(deleteProjectMock).not.toHaveBeenCalled();
  });

  it("deletes once with the exact key and converges the UI", async () => {
    deleteProjectMock.mockResolvedValue(undefined);
    useUiStore.getState().setActiveTaskId("task_1");
    const { removeSpy } = renderDialog();
    confirmKey();

    const submit = screen.getByRole("button", { name: "Permanently delete" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/projects" }));
    expect(deleteProjectMock).toHaveBeenCalledTimes(1);
    expect(deleteProjectMock).toHaveBeenCalledWith("project_1");
    expect(toastSuccess).toHaveBeenCalledWith("Project deleted.");
    expect(useUiStore.getState().activeTaskId).toBeNull();
    // The whole project subtree (list, detail, tasks, board) is dropped before
    // navigating so the deleted project cannot reappear from a stale list.
    expect(removeSpy).toHaveBeenCalledWith({
      queryKey: ["organizations", "org_1", "projects"],
    });
  });

  it("locks the dialog against duplicate submissions while deletion is in flight", async () => {
    let resolveDelete: (() => void) | undefined;
    deleteProjectMock.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    renderDialog();
    confirmKey();

    fireEvent.click(screen.getByRole("button", { name: "Permanently delete" }));
    await waitFor(() => expect(deleteProjectMock).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.submit(screen.getByRole("form", { name: "Delete project confirmation" }));
    expect(deleteProjectMock).toHaveBeenCalledTimes(1);

    resolveDelete?.();
    await waitFor(() => expect(navigateMock).toHaveBeenCalledTimes(1));
  });

  it("keeps the dialog open and the key intact when deletion fails", async () => {
    deleteProjectMock.mockRejectedValue(new ApiError(500, "Boom"));
    renderDialog();
    confirmKey();

    fireEvent.click(screen.getByRole("button", { name: "Permanently delete" }));

    await waitFor(() =>
      expect(toastError).toHaveBeenCalledWith("Could not delete the project. Try again."),
    );
    expect(navigateMock).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Project key")).toHaveProperty("value", "WEB");
  });

  it("treats a 404 as already deleted", async () => {
    deleteProjectMock.mockRejectedValue(new ApiError(404, "Not found"));
    renderDialog();
    confirmKey();

    fireEvent.click(screen.getByRole("button", { name: "Permanently delete" }));

    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith({ to: "/projects" }));
    expect(toastSuccess).toHaveBeenCalledWith("Project deleted.");
    expect(toastError).not.toHaveBeenCalled();
  });
});
