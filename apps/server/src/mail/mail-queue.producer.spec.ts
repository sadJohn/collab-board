import { Logger } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const add = vi.fn();
  const close = vi.fn();
  const quit = vi.fn();
  const disconnect = vi.fn();
  const Queue = vi.fn(function MockQueue() {
    return { add, close };
  });
  const connection = { quit, disconnect };

  return { add, close, quit, disconnect, Queue, connection };
});

vi.mock("bullmq", () => ({ Queue: mocks.Queue }));
vi.mock("../redis/redis-connection", () => ({
  createBullConnection: () => mocks.connection,
}));

import {
  type AuthEmailInput,
  MailService,
  type WorkspaceInvitationEmailInput,
} from "./mail.service";
import {
  MAIL_QUEUE,
  SEND_INVITATION_JOB,
  SEND_RESET_PASSWORD_JOB,
  SEND_VERIFICATION_JOB,
} from "./mail-queue.constants";
import { mailQueueProducer } from "./mail-queue.producer";

const invitation: WorkspaceInvitationEmailInput = {
  to: "invitee@example.com",
  inviterName: "Alice",
  organizationName: "Acme Team",
  invitationUrl: "http://localhost:5173/accept-invitation/inv_123",
};

const authEmail: AuthEmailInput = {
  email: "ada@example.com",
  userName: "Ada",
  url: "http://localhost:3000/api/auth/reset-password/abc?callbackURL=xyz",
};

const originalRedisUrl = process.env.REDIS_URL;

let sendSpy: ReturnType<typeof vi.spyOn>;
let verificationSpy: ReturnType<typeof vi.spyOn>;
let resetSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mocks.add.mockReset();
  mocks.close.mockReset();
  mocks.quit.mockReset();
  mocks.disconnect.mockReset();
  mocks.Queue.mockClear();
  mocks.add.mockResolvedValue({ id: "job_1" });
  mocks.quit.mockResolvedValue("OK");

  sendSpy = vi
    .spyOn(MailService.prototype, "sendWorkspaceInvitationEmail")
    .mockResolvedValue(undefined);
  verificationSpy = vi
    .spyOn(MailService.prototype, "sendVerificationEmail")
    .mockResolvedValue(undefined);
  resetSpy = vi.spyOn(MailService.prototype, "sendResetPasswordEmail").mockResolvedValue(undefined);
  logSpy = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
  errorSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  sendSpy.mockRestore();
  verificationSpy.mockRestore();
  resetSpy.mockRestore();
  logSpy.mockRestore();
  errorSpy.mockRestore();
  process.env.REDIS_URL = originalRedisUrl;
});

describe("MailQueueProducer", () => {
  it("sends inline when REDIS_URL is not configured", async () => {
    delete process.env.REDIS_URL;

    await mailQueueProducer.enqueueInvitation(invitation);

    expect(sendSpy).toHaveBeenCalledExactlyOnceWith(invitation);
    expect(mocks.Queue).not.toHaveBeenCalled();
  });

  it("enqueues a retryable job when REDIS_URL is configured", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";

    await mailQueueProducer.enqueueInvitation(invitation);

    expect(mocks.Queue).toHaveBeenCalledWith(MAIL_QUEUE, {
      connection: mocks.connection,
    });
    expect(mocks.add).toHaveBeenCalledWith(
      SEND_INVITATION_JOB,
      invitation,
      expect.objectContaining({
        attempts: 3,
        backoff: { type: "exponential", delay: 2000 },
      }),
    );
    expect(sendSpy).not.toHaveBeenCalled();

    await mailQueueProducer.close();
    expect(mocks.close).toHaveBeenCalledTimes(1);
    expect(mocks.quit).toHaveBeenCalledTimes(1);
  });

  it("falls back to an inline send when enqueueing fails", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";
    mocks.add.mockRejectedValue(new Error("redis down"));

    await mailQueueProducer.enqueueInvitation(invitation);

    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("redis down"));
    expect(sendSpy).toHaveBeenCalledExactlyOnceWith(invitation);
  });

  it("sends verification and reset emails inline without Redis", async () => {
    delete process.env.REDIS_URL;

    await mailQueueProducer.enqueueVerification(authEmail);
    await mailQueueProducer.enqueueResetPassword(authEmail);

    expect(verificationSpy).toHaveBeenCalledExactlyOnceWith(authEmail);
    expect(resetSpy).toHaveBeenCalledExactlyOnceWith(authEmail);
    expect(mocks.Queue).not.toHaveBeenCalled();
  });

  it("enqueues verification and reset jobs with their own job names", async () => {
    process.env.REDIS_URL = "redis://localhost:6379";

    await mailQueueProducer.enqueueVerification(authEmail);
    await mailQueueProducer.enqueueResetPassword(authEmail);

    expect(mocks.add).toHaveBeenNthCalledWith(
      1,
      SEND_VERIFICATION_JOB,
      authEmail,
      expect.anything(),
    );
    expect(mocks.add).toHaveBeenNthCalledWith(
      2,
      SEND_RESET_PASSWORD_JOB,
      authEmail,
      expect.anything(),
    );
    expect(verificationSpy).not.toHaveBeenCalled();
    expect(resetSpy).not.toHaveBeenCalled();

    await mailQueueProducer.close();
  });
});
