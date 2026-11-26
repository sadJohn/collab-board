import { createFileRoute } from "@tanstack/react-router";

import { HomePage } from "../../components/home-page";

export const Route = createFileRoute("/_app/home")({
  component: HomePage,
});
