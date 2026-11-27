import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MailProcessor } from "./mail.processor";
import type { MailService, WorkspaceInvitationEmailInput } from "./mail.service";
import type { SendInvitationJobData } from "./mail-queue.constants";

const invitation: WorkspaceInvitationEmailInput = {
  to: "invitee@example.com",
  inviterName: "Alice",
  organizationName: "Acme Team",
  invitationUrl: "http://localhost:5173/accept-invitation/inv_123",
};

function buildJob(): Job<SendInvitationJobData> {
  return {
    id: "job_1",
    attemptsMade: 0,
    data: invitation,
  } as unknown as Job<SendInvitationJobData>;
}

describe("MailProcessor", () => {
  const sendWorkspaceInvitationEmail = vi.fn();
  const mailService = {
    sendWorkspaceInvitationEmail,
  } as unknown as MailService;
  const processor = new MailProcessor(mailService);

  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    sendWorkspaceInvitationEmail.mockReset();
    logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  });

  it("consumes the job through MailService", async () => {
    sendWorkspaceInvitationEmail.mockResolvedValue(undefined);

    await expect(processor.process(buildJob())).resolves.toBeUndefined();

    expect(sendWorkspaceInvitationEmail).toHaveBeenCalledExactlyOnceWith(invitation);
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("job_1"));
  });

  it("rethrows failures so BullMQ can retry the job", async () => {
    sendWorkspaceInvitationEmail.mockRejectedValue(new Error("smtp down"));

    await expect(processor.process(buildJob())).rejects.toThrow("smtp down");
  });
});
