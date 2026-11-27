import { prisma } from "@repo/db";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";

import { MailService } from "../mail/mail.service";

const mailService = new MailService();

/** Base URL of the web app, used to build the invitation landing link. */
function frontendUrl(): string {
  return (process.env.FRONTEND_URL ?? "http://localhost:5173").replace(/\/+$/, "");
}

const githubClientId = process.env.GITHUB_CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

/**
 * BetterAuth instance shared by the HTTP handler and the auth guard.
 *
 * `basePath` must match the path the handler is mounted on in `main.ts`
 * (`/api/auth/*`), otherwise cookies and OAuth callbacks point elsewhere.
 */
export const auth = betterAuth({
  database: prismaAdapter(prisma, { provider: "postgresql" }),
  baseURL: process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
  basePath: "/api/auth",
  secret: process.env.BETTER_AUTH_SECRET,
  emailAndPassword: { enabled: true },
  socialProviders: {
    ...(githubClientId && githubClientSecret
      ? { github: { clientId: githubClientId, clientSecret: githubClientSecret } }
      : {}),
    ...(googleClientId && googleClientSecret
      ? { google: { clientId: googleClientId, clientSecret: googleClientSecret } }
      : {}),
  },
  trustedOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173").split(","),
  plugins: [
    organization({
      // Resend when configured, otherwise MailService logs the invitation URL.
      sendInvitationEmail: async (data) => {
        await mailService.sendWorkspaceInvitationEmail({
          to: data.email,
          inviterName: data.inviter.user.name,
          organizationName: data.organization.name,
          invitationUrl: `${frontendUrl()}/accept-invitation/${data.id}`,
        });
      },
    }),
  ],
});
