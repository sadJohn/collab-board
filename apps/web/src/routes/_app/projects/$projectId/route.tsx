import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { OnlinePresenceAvatars } from "../../../../components/presence/online-presence-avatars";
import { TaskDrawer } from "../../../../components/task/task-drawer";
import { useProjectPresence } from "../../../../hooks/use-project-presence";
import { useProjectRealtime } from "../../../../hooks/use-project-realtime";
import { useProjectRoom } from "../../../../hooks/use-project-room";
import { getProject } from "../../../../lib/api/projects";
import { ApiError } from "../../../../lib/api-client";
import { useSession } from "../../../../lib/auth-client";
import { queryKeys } from "../../../../lib/query-keys";
import { DEFAULT_TASK_LIST_SEARCH } from "../../../../lib/task-search";
import { tracker } from "../../../../lib/tracker";
import { useActiveWorkspace } from "../../../../lib/use-active-workspace";
import { useUiStore } from "../../../../stores/ui-store";

/**
 * Optional `task` search param lets deep links (e.g. notification clicks) open
 * the task detail drawer straight from the URL. Declared on the layout so both
 * the board and list tabs honor it.
 */
const projectRouteSearchSchema = z.object({
  task: z.string().optional(),
});

export const Route = createFileRoute("/_app/projects/$projectId")({
  validateSearch: projectRouteSearchSchema,
  component: ProjectLayout,
});

const TAB_CLASS =
  "rounded-md px-3 py-2 text-muted-foreground text-sm hover:bg-accent hover:text-foreground";
const ACTIVE_TAB_CLASS = "rounded-md bg-accent px-3 py-2 font-medium text-foreground text-sm";

function ProjectLayout() {
  const { projectId } = Route.useParams();
  const { task } = Route.useSearch();
  const { t } = useTranslation();
  const activeOrganization = useActiveWorkspace();
  const organizationId = activeOrganization.data?.id;
  const currentUserId = useSession().data?.user.id;
  const setActiveTaskId = useUiStore((state) => state.setActiveTaskId);

  // Join the project room and mirror broadcasts into the query cache.
  useProjectRoom(projectId);
  useProjectRealtime(projectId);
  const presenceUsers = useProjectPresence(projectId);

  // Open the task drawer from the `?task=` deep link (e.g. a notification
  // click), or clear it when absent. Re-running on projectId change — and the
  // cleanup on unmount — keeps a drawer opened in another project/route from
  // leaking in.
  useEffect(() => {
    if (!projectId) {
      return;
    }

    setActiveTaskId(task ?? null);

    return () => setActiveTaskId(null);
  }, [projectId, task, setActiveTaskId]);

  // Track board <-> list view switches. The initial mount seeds the ref without
  // emitting, so only real user-driven switches (tab clicks, command palette
  // navigation) are counted.
  const location = useLocation();
  const previousView = useRef<string | null>(null);
  useEffect(() => {
    const view = location.pathname.endsWith("/board")
      ? "board"
      : location.pathname.endsWith("/list")
        ? "list"
        : null;
    if (view && previousView.current !== null && previousView.current !== view) {
      tracker.track("VIEW_SWITCHED", { view });
    }
    previousView.current = view;
  }, [location.pathname]);

  const projectQuery = useQuery({
    queryKey: queryKeys.projects.detail(organizationId ?? "", projectId),
    queryFn: () => getProject(projectId),
    enabled: Boolean(organizationId) && !activeOrganization.isSwitching,
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
          <div className="ml-auto">
            <OnlinePresenceAvatars users={presenceUsers} currentUserId={currentUserId} />
          </div>
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
