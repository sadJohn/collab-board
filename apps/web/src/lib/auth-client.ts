import { organizationClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

const apiUrl = (import.meta.env.VITE_API_URL || "http://localhost:3000").replace(/\/+$/, "");

/**
 * BetterAuth browser client.
 *
 * `basePath` stays at the default `/api/auth`, matching the route the NestJS
 * server mounts the auth handler on. `credentials: "include"` is required
 * because the web app runs on a different port than the API.
 */
export const authClient = createAuthClient({
  baseURL: apiUrl,
  plugins: [organizationClient()],
  fetchOptions: {
    credentials: "include",
  },
});

export const { useSession, useActiveOrganization, useListOrganizations } = authClient;
