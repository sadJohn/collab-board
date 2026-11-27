import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MailProcessor } from "./mail.processor";
import type { AuthEmailInput, MailService, WorkspaceInvitationEmailInput } from "./mail.service";
import {
  type MailJobData,
  SEND_INVITATION_JOB,
  SEND_RESET_PASSWORD_JOB,
  SEND_VERIFICATION_JOB,
} from "./mail-queue.constants";

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

function buildJob(name: string, data: MailJobData): Job<MailJobData> {
  return {
    id: "job_1",
    name,
    attemptsMade: 0,
    data,
  } as unknown as Job<MailJobData>;
}

describe("MailProcessor", () => {
  const sendWorkspaceInvitationEmail = vi.fn();
  const sendVerificationEmail = vi.fn();
  const sendResetPasswordEmail = vi.fn();
  const mailService = {
    sendWorkspaceInvitationEmail,
    sendVerificationEmail,
    sendResetPasswordEmail,
  } as unknown as MailService;
  const processor = new MailProcessor(mailService);

  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sendWorkspaceInvitationEmail.mockReset();
    sendVerificationEmail.mockReset();
    sendResetPasswordEmail.mockReset();
    logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  it("consumes the invitation job through MailService", async () => {
    sendWorkspaceInvitationEmail.mockResolvedValue(undefined);

    await expect(
      processor.process(buildJob(SEND_INVITATION_JOB, invitation)),
    ).resolves.toBeUndefined();

    expect(sendWorkspaceInvitationEmail).toHaveBeenCalledExactlyOnceWith(invitation);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("job_1"));
  });

  it("consumes the email-verification job through MailService", async () => {
    sendVerificationEmail.mockResolvedValue(undefined);

    await expect(
      processor.process(buildJob(SEND_VERIFICATION_JOB, authEmail)),
    ).resolves.toBeUndefined();

    expect(sendVerificationEmail).toHaveBeenCalledExactlyOnceWith(authEmail);
    expect(sendWorkspaceInvitationEmail).not.toHaveBeenCalled();
  });

  it("consumes the password-reset job through MailService", async () => {
    sendResetPasswordEmail.mockResolvedValue(undefined);

    await expect(
      processor.process(buildJob(SEND_RESET_PASSWORD_JOB, authEmail)),
    ).resolves.toBeUndefined();

    expect(sendResetPasswordEmail).toHaveBeenCalledExactlyOnceWith(authEmail);
  });

  it("rejects unknown job names instead of silently dropping them", async () => {
    await expect(processor.process(buildJob("send-unknown", authEmail))).rejects.toThrow(
      "未知邮件任务类型：send-unknown",
    );
  });

  it("rethrows failures so BullMQ can retry the job", async () => {
    sendVerificationEmail.mockRejectedValue(new Error("smtp down"));

    await expect(processor.process(buildJob(SEND_VERIFICATION_JOB, authEmail))).rejects.toThrow(
      "smtp down",
    );
  });
});
