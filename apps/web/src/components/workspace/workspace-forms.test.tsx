import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { authClient } from "@/lib/auth-client";
import i18n from "@/locales/i18n";
import { CreateOrganizationForm } from "./create-organization-form";
import { InviteMemberForm } from "./invite-member-form";

vi.mock("@/lib/auth-client", () => ({
  authClient: {
    organization: {
      create: vi.fn(),
      inviteMember: vi.fn(),
    },
  },
}));

type CreateResult = Awaited<ReturnType<typeof authClient.organization.create>>;
type InviteResult = Awaited<ReturnType<typeof authClient.organization.inviteMember>>;

const createOrganization = vi.mocked(authClient.organization.create);
const inviteMember = vi.mocked(authClient.organization.inviteMember);

beforeAll(async () => {
  await i18n.changeLanguage("en-US");
});

beforeEach(() => {
  createOrganization.mockReset();
  inviteMember.mockReset();
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
      expect(screen.getByRole("alert").textContent).toBe("Slug already taken");
    });
    expect(onCreated).not.toHaveBeenCalled();
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
