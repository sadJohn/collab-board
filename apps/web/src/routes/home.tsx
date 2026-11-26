import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "../components/home-page";
import { requireSession } from "../lib/route-guards";

export const Route = createFileRoute("/home")({
  beforeLoad: ({ context, location }) => requireSession(context.queryClient, location.href),
  component: HomePage,
});
