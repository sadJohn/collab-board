import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MailService, type WorkspaceInvitationEmailInput } from "./mail.service";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mocks.send };
  },
}));

const invitation: WorkspaceInvitationEmailInput = {
  to: "invitee@example.com",
  inviterName: "Alice",
  organizationName: "Acme Team",
  invitationUrl: "http://localhost:5173/accept-invitation/inv_123",
};

const originalEnv = { ...process.env };
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.send.mockReset();
  mocks.send.mockResolvedValue({ data: { id: "email_1" }, error: null });
  logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  errorSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
  delete process.env.RESEND_API_KEY;
  delete process.env.EMAIL_FROM;
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  process.env.RESEND_API_KEY = originalEnv.RESEND_API_KEY;
  process.env.EMAIL_FROM = originalEnv.EMAIL_FROM;
});

describe("MailService.sendWorkspaceInvitationEmail", () => {
  it("配置 RESEND_API_KEY 时通过 Resend 发送邀请邮件", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.EMAIL_FROM = "Collab Board <invites@example.com>";

    await new MailService().sendWorkspaceInvitationEmail(invitation);

    expect(mocks.send).toHaveBeenCalledTimes(1);
    const payload = mocks.send.mock.calls[0]?.[0] as {
      from: string;
      html: string;
      subject: string;
      to: string;
    };
    expect(payload.from).toBe("Collab Board <invites@example.com>");
    expect(payload.to).toBe(invitation.to);
    expect(payload.subject).toContain("Alice");
    expect(payload.subject).toContain("Acme Team");
    expect(payload.html).toContain(invitation.invitationUrl);
    expect(payload.html).toContain("Acme Team");
  });

  it("未配置 RESEND_API_KEY 时降级为 Logger 输出邀请链接且不调用 Resend", async () => {
    await new MailService().sendWorkspaceInvitationEmail(invitation);

    expect(mocks.send).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(invitation.invitationUrl));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(invitation.to));
  });

  it("Resend 返回错误时记录错误并降级输出邀请链接", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    mocks.send.mockResolvedValue({ data: null, error: { message: "boom" } });

    await new MailService().sendWorkspaceInvitationEmail(invitation);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("boom"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(invitation.invitationUrl));
  });
});
