import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { TaskDrawer } from "../../../../components/task/task-drawer";
import { getProject } from "../../../../lib/api/projects";
import { ApiError } from "../../../../lib/api-client";
import { useActiveOrganization } from "../../../../lib/auth-client";
import { queryKeys } from "../../../../lib/query-keys";
import { DEFAULT_TASK_LIST_SEARCH } from "../../../../lib/task-search";
import { useUiStore } from "../../../../stores/ui-store";

export const Route = createFileRoute("/_app/projects/$projectId")({
  component: ProjectLayout,
});

const TAB_CLASS =
  "rounded-md px-3 py-2 text-muted-foreground text-sm hover:bg-accent hover:text-foreground";
const ACTIVE_TAB_CLASS = "rounded-md bg-accent px-3 py-2 font-medium text-foreground text-sm";

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const { t } = useTranslation();
  const activeOrganization = useActiveOrganization();
  const organizationId = activeOrganization.data?.id;
  const setActiveTaskId = useUiStore((state) => state.setActiveTaskId);

  // A drawer opened in another project (or on another route) must never leak in.
  useEffect(() => {
    if (projectId) {
      setActiveTaskId(null);
    }

    return () => setActiveTaskId(null);
  }, [projectId, setActiveTaskId]);

  const projectQuery = useQuery({
    queryKey: queryKeys.projects.detail(organizationId ?? "", projectId),
    queryFn: () => getProject(projectId),
    enabled: Boolean(organizationId),
  });
  const project = projectQuery.data;

  if (!organizationId) {
    return (
      <p className="rounded-xl border bg-card p-5 text-muted-foreground text-sm">
        {t("projects.noWorkspace")}{" "}
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          to="/workspace"
        >
          {t("projects.selectWorkspace")}
        </Link>
      </p>
    );
  }

  if (projectQuery.isPending) {
    return <p className="text-muted-foreground text-sm">{t("projects.loading")}</p>;
  }

  if (projectQuery.isError) {
    const notFound = projectQuery.error instanceof ApiError && projectQuery.error.status === 404;

    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-5">
        <p className={notFound ? "text-sm" : "text-destructive text-sm"}>
          {notFound ? t("projects.notFound") : t("projects.loadFailed")}
        </p>
        <Link
          className="font-medium text-primary text-sm underline-offset-4 hover:underline"
          to="/projects"
        >
          {t("projects.backToList")}
        </Link>
      </div>
    );
  }

  if (!project) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <Link
          className="w-fit text-muted-foreground text-sm underline-offset-4 hover:text-foreground hover:underline"
          to="/projects"
        >
          {t("projects.backToList")}
        </Link>

        <div className="flex items-center gap-3">
          <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
            {project.key}
          </span>
          <h1 className="font-semibold text-2xl tracking-tight">{project.name}</h1>
        </div>

        {project.description ? (
          <p className="text-muted-foreground text-sm">{project.description}</p>
        ) : null}
      </header>

      <nav className="flex gap-1 border-b pb-2">
        <Link
          activeProps={{ className: ACTIVE_TAB_CLASS }}
          className={TAB_CLASS}
          params={{ projectId }}
          to="/projects/$projectId/board"
        >
          {t("projects.boardTab")}
        </Link>
        <Link
          activeProps={{ className: ACTIVE_TAB_CLASS }}
          className={TAB_CLASS}
          params={{ projectId }}
          search={DEFAULT_TASK_LIST_SEARCH}
          to="/projects/$projectId/list"
        >
          {t("projects.listTab")}
        </Link>
      </nav>

      <Outlet />
      <TaskDrawer />
    </div>
  );
}
