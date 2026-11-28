import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { toast } from "sonner";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "@/lib/auth-client";
import i18n from "@/locales/i18n";
import { CreateOrganizationDialog } from "./create-organization-dialog";
import { CreateOrganizationForm } from "./create-organization-form";
import { DeleteOrganizationDialog } from "./delete-organization-dialog";
import { EditOrganizationDialog } from "./edit-organization-dialog";
import { InviteMemberForm } from "./invite-member-form";
import { UpdateOrganizationForm } from "./update-organization-form";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    organization: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      inviteMember: vi.fn(),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

type CreateResult = Awaited<ReturnType<typeof authClient.organization.create>>;
type InviteResult = Awaited<ReturnType<typeof authClient.organization.inviteMember>>;
type UpdateResult = Awaited<ReturnType<typeof authClient.organization.update>>;
type DeleteResult = Awaited<ReturnType<typeof authClient.organization.delete>>;

const createOrganization = vi.mocked(authClient.organization.create);
const inviteMember = vi.mocked(authClient.organization.inviteMember);
const updateOrganization = vi.mocked(authClient.organization.update);
const deleteOrganization = vi.mocked(authClient.organization.delete);
const toastError = vi.mocked(toast.error);
const toastSuccess = vi.mocked(toast.success);

beforeAll(async () => {
  await i18n.changeLanguage("en-US");
});

beforeEach(() => {
  createOrganization.mockReset();
  inviteMember.mockReset();
  updateOrganization.mockReset();
  deleteOrganization.mockReset();
  toastError.mockReset();
  toastSuccess.mockReset();
});

describe("CreateOrganizationForm", () => {
  it("submits the name and slug and refreshes the caller", async () => {
    createOrganization.mockResolvedValue({
      data: { id: "org-1", name: "Acme", slug: "acme" },
      error: null,
    } as unknown as CreateResult);
    const onCreated = vi.fn().mockResolvedValue(undefined);
    render(<CreateOrganizationForm onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalledTimes(1);
    });
    expect(createOrganization).toHaveBeenCalledWith({ name: "Acme", slug: "acme" });
  });

  it("shows the server error and keeps the caller untouched", async () => {
    createOrganization.mockResolvedValue({
      data: null,
      error: { message: "Slug already taken" },
    } as unknown as CreateResult);
    const onCreated = vi.fn().mockResolvedValue(undefined);
    render(<CreateOrganizationForm onCreated={onCreated} />);

    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(toastError).toHaveBeenCalledWith("Slug already taken");
    });
    expect(onCreated).not.toHaveBeenCalled();
  });
});

describe("CreateOrganizationDialog", () => {
  it("creates a workspace inside a dialog and closes afterwards", async () => {
    createOrganization.mockResolvedValue({
      data: { id: "org-1", name: "Acme", slug: "acme" },
      error: null,
    } as unknown as CreateResult);
    const onCreated = vi.fn().mockResolvedValue(undefined);
    render(<CreateOrganizationDialog onCreated={onCreated} />);

    expect(screen.queryByLabelText("Name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme" } });
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(createOrganization).toHaveBeenCalledWith({ name: "Acme", slug: "acme" });
  });

  it("closes without creating when cancelled", async () => {
    const onCreated = vi.fn().mockResolvedValue(undefined);
    render(<CreateOrganizationDialog onCreated={onCreated} />);

    fireEvent.click(screen.getByRole("button", { name: "Create workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(createOrganization).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});

function renderUpdateOrganizationForm() {
  const onUpdated = vi.fn().mockResolvedValue(undefined);
  const organization = { id: "org-1", name: "Acme", slug: "acme" };
  const utils = render(
    <UpdateOrganizationForm organization={organization} onUpdated={onUpdated} />,
  );

  return { ...utils, onUpdated, UpdateOrganizationForm };
}

describe("UpdateOrganizationForm", () => {
  it("submits the edited name and slug with isolated field ids", async () => {
    updateOrganization.mockResolvedValue({
      data: { id: "org-1", name: "Acme Updated", slug: "acme-next" },
      error: null,
    } as unknown as UpdateResult);
    const { onUpdated } = await renderUpdateOrganizationForm();

    expect(screen.getByLabelText("Name").id).toBe("update-organization-name");
    expect(screen.getByLabelText("Slug").id).toBe("update-organization-slug");
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme Updated" } });
    fireEvent.change(screen.getByLabelText("Slug"), { target: { value: "acme-next" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    expect(updateOrganization).toHaveBeenCalledWith({
      organizationId: "org-1",
      data: { name: "Acme Updated", slug: "acme-next" },
    });
    expect(toastSuccess).toHaveBeenCalledWith("Workspace updated.");
  });

  it("maps a slug conflict to the slug field", async () => {
    updateOrganization.mockResolvedValue({
      data: null,
      error: { code: "ORGANIZATION_SLUG_ALREADY_TAKEN", message: "Slug already taken" },
    } as unknown as UpdateResult);
    const { onUpdated } = await renderUpdateOrganizationForm();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    expect(await screen.findByText("This slug is already in use.")).toBeTruthy();
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("shows a permission failure without refreshing the caller", async () => {
    updateOrganization.mockResolvedValue({
      data: null,
      error: { status: 403, message: "You are not allowed" },
    } as unknown as UpdateResult);
    const { onUpdated } = await renderUpdateOrganizationForm();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("You are not allowed"));
    expect(onUpdated).not.toHaveBeenCalled();
  });

  it("resets the form when the organization changes", async () => {
    const { rerender, onUpdated, UpdateOrganizationForm } = await renderUpdateOrganizationForm();
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Draft" } });

    rerender(
      <UpdateOrganizationForm
        organization={{ id: "org-2", name: "Beta", slug: "beta" }}
        onUpdated={onUpdated}
      />,
    );

    await waitFor(() => {
      expect(screen.getByLabelText("Name")).toHaveProperty("value", "Beta");
      expect(screen.getByLabelText("Slug")).toHaveProperty("value", "beta");
    });
  });
});

function renderDeleteOrganizationDialog(reconcileResult = true) {
  const onReconcile = vi.fn().mockResolvedValue(reconcileResult);
  render(
    <DeleteOrganizationDialog
      organization={{ id: "org-1", name: "Acme", slug: "acme" }}
      onReconcile={onReconcile}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Delete workspace" }));
  return { onReconcile };
}

describe("EditOrganizationDialog", () => {
  function renderEditOrganizationDialog() {
    const onUpdated = vi.fn().mockResolvedValue(undefined);
    render(
      <EditOrganizationDialog
        organization={{ id: "org-1", name: "Acme", slug: "acme" }}
        onUpdated={onUpdated}
      />,
    );
    return { onUpdated };
  }

  it("edits the workspace inside a dialog and closes after saving", async () => {
    updateOrganization.mockResolvedValue({
      data: { id: "org-1", name: "Acme Updated", slug: "acme" },
      error: null,
    } as unknown as UpdateResult);
    const { onUpdated } = renderEditOrganizationDialog();

    expect(screen.queryByLabelText("Name")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Edit workspace" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Acme Updated" } });
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(updateOrganization).toHaveBeenCalledWith({
      organizationId: "org-1",
      data: { name: "Acme Updated", slug: "acme" },
    });
  });

  it("closes without saving when editing is cancelled", async () => {
    const { onUpdated } = renderEditOrganizationDialog();

    fireEvent.click(screen.getByRole("button", { name: "Edit workspace" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(updateOrganization).not.toHaveBeenCalled();
    expect(onUpdated).not.toHaveBeenCalled();
  });
});

describe("DeleteOrganizationDialog", () => {
  it("describes the confirmation input with its hint", async () => {
    await renderDeleteOrganizationDialog();

    const input = screen.getByLabelText("Workspace slug");
    const describedBy = input.getAttribute("aria-describedby");

    expect(describedBy).toBe("delete-organization-confirmationSlug-description");
    expect(document.getElementById(describedBy ?? "")?.textContent).toBe(
      "Enter acme to confirm deletion.",
    );
  });

  it("does not submit a mismatched confirmation slug", async () => {
    const { onReconcile } = await renderDeleteOrganizationDialog();
    const submit = screen.getByRole("button", { name: "Permanently delete" });

    fireEvent.change(screen.getByLabelText("Workspace slug"), { target: { value: "wrong" } });
    expect(submit).toHaveProperty("disabled", true);
    fireEvent.submit(screen.getByRole("form", { name: "Delete workspace confirmation" }));

    expect(deleteOrganization).not.toHaveBeenCalled();
    expect(onReconcile).not.toHaveBeenCalled();
  });

  it("deletes once and reconciles the workspace state", async () => {
    deleteOrganization.mockResolvedValue({ data: true, error: null } as unknown as DeleteResult);
    const { onReconcile } = await renderDeleteOrganizationDialog();

    fireEvent.change(screen.getByLabelText("Workspace slug"), { target: { value: "acme" } });
    const submit = screen.getByRole("button", { name: "Permanently delete" });
    fireEvent.click(submit);
    fireEvent.click(submit);

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Workspace deleted."));
    expect(deleteOrganization).toHaveBeenCalledTimes(1);
    expect(deleteOrganization).toHaveBeenCalledWith({ organizationId: "org-1" });
    expect(onReconcile).toHaveBeenCalledWith("org-1");
  });

  it("locks the dialog against duplicate submissions while deletion is in flight", async () => {
    let resolveDelete: ((result: DeleteResult) => void) | undefined;
    deleteOrganization.mockImplementation(
      () =>
        new Promise<DeleteResult>((resolve) => {
          resolveDelete = resolve;
        }),
    );
    const { onReconcile } = await renderDeleteOrganizationDialog();

    fireEvent.change(screen.getByLabelText("Workspace slug"), { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete" }));
    await waitFor(() => expect(deleteOrganization).toHaveBeenCalledTimes(1));

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    fireEvent.submit(screen.getByRole("form", { name: "Delete workspace confirmation" }));
    expect(deleteOrganization).toHaveBeenCalledTimes(1);

    resolveDelete?.({ data: true, error: null } as unknown as DeleteResult);
    await waitFor(() => expect(onReconcile).toHaveBeenCalledTimes(1));
  });

  it("keeps the dialog open when deletion fails and the workspace still exists", async () => {
    deleteOrganization.mockResolvedValue({
      data: null,
      error: { message: "Not allowed" },
    } as unknown as DeleteResult);
    const { onReconcile } = await renderDeleteOrganizationDialog(false);

    fireEvent.change(screen.getByLabelText("Workspace slug"), { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete" }));

    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Not allowed"));
    expect(onReconcile).toHaveBeenCalledWith("org-1");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByLabelText("Workspace slug")).toHaveProperty("value", "acme");
  });

  it("treats a failed response as deleted when reconciliation confirms it", async () => {
    deleteOrganization.mockRejectedValue(new Error("Network unavailable"));
    const { onReconcile } = await renderDeleteOrganizationDialog(true);

    fireEvent.change(screen.getByLabelText("Workspace slug"), { target: { value: "acme" } });
    fireEvent.click(screen.getByRole("button", { name: "Permanently delete" }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith("Workspace deleted."));
    expect(onReconcile).toHaveBeenCalledWith("org-1");
    expect(toastError).not.toHaveBeenCalled();
  });
});

describe("InviteMemberForm", () => {
  it("asks for an active workspace when none is selected", () => {
    render(<InviteMemberForm organizationId={undefined} />);

    expect(screen.getByText("Select a workspace first.")).toBeTruthy();
    expect(screen.queryByLabelText("Member email")).toBeNull();
  });

  it("invites the email to the active workspace and confirms it", async () => {
    inviteMember.mockResolvedValue({
      data: { id: "invitation-1", status: "pending" },
      error: null,
    } as unknown as InviteResult);
    render(<InviteMemberForm organizationId="org-1" />);

    fireEvent.change(screen.getByLabelText("Member email"), {
      target: { value: "invitee@example.com" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send invite" }));

    await waitFor(() => {
      expect(screen.getByRole("status").textContent).toBe(
        "Invitation sent to invitee@example.com.",
      );
    });
    expect(inviteMember).toHaveBeenCalledWith({
      email: "invitee@example.com",
      role: "member",
      organizationId: "org-1",
    });
  });
});
