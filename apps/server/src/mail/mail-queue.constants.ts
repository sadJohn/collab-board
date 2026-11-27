import type { JobsOptions } from "bullmq";
import type { WorkspaceInvitationEmailInput } from "./mail.service";

/** BullMQ queue name shared by the producer and the Nest processor. */
export const MAIL_QUEUE = "mail";

/** Job name for a workspace invitation email. */
export const SEND_INVITATION_JOB = "send-invitation";

/** Strictly typed payload carried by the `mail` queue. */
export type SendInvitationJobData = WorkspaceInvitationEmailInput;

/** Three attempts with exponential backoff (2s, 4s, 8s). */
export const MAIL_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: { type: "exponential", delay: 2000 },
};
