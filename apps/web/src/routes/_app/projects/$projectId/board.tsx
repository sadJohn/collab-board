import { createFileRoute } from "@tanstack/react-router";

import { KanbanBoard } from "@/components/board/kanban-board";

export const Route = createFileRoute("/_app/projects/$projectId/board")({
  component: ProjectBoardPage,
});

function ProjectBoardPage() {
  const { projectId } = Route.useParams();

  return <KanbanBoard projectId={projectId} />;
}
