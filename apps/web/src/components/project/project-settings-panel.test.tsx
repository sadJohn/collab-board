import type { ProjectDto } from "@repo/shared";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";

import i18n from "@/locales/i18n";
import { ProjectSettingsPanel } from "./project-settings-panel";

vi.mock("@/lib/api/projects", () => ({
  createProject: vi.fn(),
  updateProject: vi.fn(),
}));

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

function renderPanel(canManage: boolean, resolved = true) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ProjectSettingsPanel canManage={canManage} project={project} resolved={resolved} />
    </QueryClientProvider>,
  );
}

describe("ProjectSettingsPanel", () => {
  it("shows the prefilled edit form to owners and admins", () => {
    renderPanel(true);

    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Website");
    expect(screen.getByLabelText("Key")).toHaveProperty("value", "WEB");
    expect(screen.getByRole("button", { name: "Save changes" })).toBeTruthy();
  });

  it("hides the form from members and explains the restriction", () => {
    renderPanel(false);

    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.getByText("Only workspace owners or admins can edit this project.")).toBeTruthy();
  });

  it("resets the form when the project changes", () => {
    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const { rerender } = render(
      <QueryClientProvider client={queryClient}>
        <ProjectSettingsPanel canManage project={project} resolved />
      </QueryClientProvider>,
    );

    rerender(
      <QueryClientProvider client={queryClient}>
        <ProjectSettingsPanel
          canManage
          project={{
            ...project,
            id: "project_2",
            name: "Beta",
            key: "BETA",
            description: "Second",
          }}
          resolved
        />
      </QueryClientProvider>,
    );

    expect(screen.getByLabelText("Name")).toHaveProperty("value", "Beta");
    expect(screen.getByLabelText("Key")).toHaveProperty("value", "BETA");
  });

  it("fails closed while the role is still being resolved", () => {
    renderPanel(false, false);

    expect(screen.queryByLabelText("Name")).toBeNull();
    expect(screen.getByText("Checking your permissions…")).toBeTruthy();
  });
});
