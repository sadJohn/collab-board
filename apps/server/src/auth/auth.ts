import { prisma } from "@repo/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";

import { mailQueueProducer } from "../mail/mail-queue.producer";
import { createWorkspaceDatabaseHooks } from "./workspace-database-hooks";
import { createWorkspaceOrganizationHooks } from "./workspace-organization-hooks";

/** Base URL of the web app, used to build the invitation landing link. */
function frontendUrl(): string {
  return (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/+$/, "");
}

const githubClientId = process.env.GITHUB_CLIENT_ID?.trim();
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET?.trim();
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

// GitHub is the only social provider this app requires: sign-in / sign-up both
// expose it, so a missing credential must fail fast instead of silently hiding
// the button and producing a confusing "provider not found" error later.
if (!githubClientId || !githubClientSecret) {
  throw new Error(
    `缺少 GitHub OAuth 凭据：请在 .env 中设置 GITHUB_CLIENT_ID 与 GITHUB_CLIENT_SECRET，并将 OAuth App 回调地址配置为 ${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/api/auth/callback/github`,
  );
}

/**
 * BetterAuth instance shared by the HTTP handler and the auth guard.
 *
 * `basePath` must match the path the handler is mounted on in `main.ts`
 * (`/api/auth/*`), otherwise cookies and OAuth callbacks point elsewhere.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  databaseHooks: createWorkspaceDatabaseHooks(prisma),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: {
    enabled: true,
    // Password accounts stay locked until the verification link is opened.
    // GitHub sign-ups arrive already verified from the provider.
    requireEmailVerification: true,
    // BetterAuth generates the one-time url (token + callbackURL); forward it
    // verbatim — reconstructing it here would break the token signature.
    sendResetPassword: async ({ user, url }) => {
      await mailQueueProducer.enqueueResetPassword({
        email: user.email,
        userName: user.name,
        url,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user, url }) => {
      await mailQueueProducer.enqueueVerification({
        email: user.email,
        userName: user.name,
        url,
      });
    },
  },
  socialProviders: {
    github: { clientId: githubClientId, clientSecret: githubClientSecret },
    ...(googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : {}),
  },
  trustedOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(","),
  plugins: [
    organization({
      organizationHooks: createWorkspaceOrganizationHooks(prisma),
      // With Redis configured this enqueues a BullMQ job; otherwise the
      // producer falls back to sending (or logging) the invitation inline.
      sendInvitationEmail: async (data) => {
        await mailQueueProducer.enqueueInvitation({
          to: data.email,
          inviterName: data.inviter.user.name,
          organizationName: data.organization.name,
          invitationUrl: `${frontendUrl()}/accept-invitation/${data.id}`,
        });
      },
    }),
  ],
});
