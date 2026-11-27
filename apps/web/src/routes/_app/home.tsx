import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy entry point kept as a bookmark-safe redirect to the dashboard. */
export const Route = createFileRoute("/_app/home")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
