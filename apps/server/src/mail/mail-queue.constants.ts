import type { JobsOptions } from "bullmq";
import type { AuthEmailInput, WorkspaceInvitationEmailInput } from "./mail.service";

/** BullMQ queue name shared by the producer and the Nest processor. */
export const MAIL_QUEUE = "mail";

/** Job name for a workspace invitation email. */
export const SEND_INVITATION_JOB = "send-invitation";

/** Job name for a BetterAuth email-verification link. */
export const SEND_VERIFICATION_JOB = "send-verification";

/** Job name for a BetterAuth password-reset link. */
export const SEND_RESET_PASSWORD_JOB = "send-reset-password";

/** Strictly typed payload carried by the `mail` queue. */
export type SendInvitationJobData = WorkspaceInvitationEmailInput;
export type SendVerificationJobData = AuthEmailInput;
export type SendResetPasswordJobData = AuthEmailInput;

/** Union of every payload the `mail` worker may receive. */
export type MailJobData =
  | SendInvitationJobData
  | SendVerificationJobData
  | SendResetPasswordJobData;

/** Three attempts with exponential backoff (2s, 4s, 8s). */
export const MAIL_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
};
