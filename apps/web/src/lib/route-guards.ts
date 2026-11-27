import type { QueryClient } from "@tanstack/react-query";
import { redirect } from "@tanstack/react-router";

import { sessionQueryOptions } from "./session";

/**
 * Guard for protected routes. Anonymous visitors are sent to /login with the
 * requested href in `search.redirect` so they return after signing in.
 */
export async function requireSession(queryClient: QueryClient, href: string) {
  const session = await queryClient.query({ ...sessionQueryOptions, staleTime: "static" });

  if (!session) {
    throw redirect({ to: "/login", search: { redirect: href } });
  }

  return session;
}

/** Keeps signed-in users out of /login and /register. */
export async function redirectIfAuthenticated(queryClient: QueryClient) {
  const session = await queryClient.query({ ...sessionQueryOptions, staleTime: "static" });

  if (session) {
    throw redirect({ to: "/dashboard" });
  }
}
