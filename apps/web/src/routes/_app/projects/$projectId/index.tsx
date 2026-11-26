import { createFileRoute, redirect } from "@tanstack/react-router";

/** `/projects/:projectId` defaults to the board view. */
export const Route = createFileRoute("/_app/projects/$projectId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/projects/$projectId/board",
      params: { projectId: params.projectId },
    });
  },
});
