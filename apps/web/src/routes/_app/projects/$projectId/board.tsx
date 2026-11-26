import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/_app/projects/$projectId/board")({
  component: ProjectBoardPage,
});

function ProjectBoardPage() {
  const { t } = useTranslation();

  return (
    <p className="rounded-xl border border-dashed bg-card p-8 text-muted-foreground text-sm">
      {t("projects.boardPlaceholder")}
    </p>
  );
}
