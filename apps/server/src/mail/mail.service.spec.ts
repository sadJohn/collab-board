import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AuthEmailInput,
  MailService,
  type WorkspaceInvitationEmailInput,
} from "./mail.service";

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

const authEmail: AuthEmailInput = {
  email: "ada@example.com",
  userName: "Ada",
  url: "http://localhost:3000/api/auth/verify-email?token=abc",
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

  it("Resend 返回错误时记录错误、降级输出邀请链接并抛错供队列重试", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    mocks.send.mockResolvedValue({ data: null, error: { message: "boom" } });

    await expect(new MailService().sendWorkspaceInvitationEmail(invitation)).rejects.toThrow(
      "boom",
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("boom"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(invitation.invitationUrl));
  });

  it("Resend 调用抛异常时记录错误、降级输出邀请链接并重新抛出", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    mocks.send.mockRejectedValue(new Error("network down"));

    await expect(new MailService().sendWorkspaceInvitationEmail(invitation)).rejects.toThrow(
      "network down",
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("network down"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(invitation.invitationUrl));
  });
});

describe("MailService auth emails", () => {
  it("prints the verification link when RESEND_API_KEY is missing", async () => {
    await new MailService().sendVerificationEmail(authEmail);

    expect(mocks.send).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(authEmail.url));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(authEmail.email));
  });

  it("prints the reset link when RESEND_API_KEY is missing", async () => {
    await new MailService().sendResetPasswordEmail(authEmail);

    expect(mocks.send).not.toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(authEmail.url));
  });

  it("sends both auth emails through Resend with the BetterAuth url untouched", async () => {
    process.env.RESEND_API_KEY = "re_test_key";

    await new MailService().sendVerificationEmail(authEmail);
    await new MailService().sendResetPasswordEmail(authEmail);

    expect(mocks.send).toHaveBeenCalledTimes(2);
    const verification = mocks.send.mock.calls[0]?.[0] as { html: string; subject: string };
    const reset = mocks.send.mock.calls[1]?.[0] as { html: string; subject: string };
    expect(verification.subject).toContain("Verify your email");
    expect(verification.html).toContain(authEmail.url);
    expect(reset.subject).toContain("Reset your password");
    expect(reset.html).toContain(authEmail.url);
  });

  it("logs the link and rethrows when Resend rejects an auth email", async () => {
    process.env.RESEND_API_KEY = "re_test_key";
    mocks.send.mockResolvedValue({ data: null, error: { message: "quota exceeded" } });

    await expect(new MailService().sendResetPasswordEmail(authEmail)).rejects.toThrow(
      "quota exceeded",
    );

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("quota exceeded"));
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining(authEmail.url));
  });
});
