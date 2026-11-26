import { Button } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { CreateProjectDialog } from "../../../components/project/create-project-dialog";
import { listProjects } from "../../../lib/api/projects";
import { useActiveOrganization } from "../../../lib/auth-client";
import { queryKeys } from "../../../lib/query-keys";

export const Route = createFileRoute("/_app/projects/")({
  component: ProjectsPage,
});

function ProjectsPage() {
  const { t } = useTranslation();
  const activeOrganization = useActiveOrganization();
  const organizationId = activeOrganization.data?.id;
  const [dialogOpen, setDialogOpen] = useState(false);

  const projectsQuery = useQuery({
    queryKey: queryKeys.projects.all(organizationId ?? ""),
    queryFn: listProjects,
    enabled: Boolean(organizationId),
  });

  const projects = projectsQuery.data ?? [];

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl tracking-tight">{t("projects.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("projects.subtitle")}</p>
        </div>

        {organizationId ? (
          <Button onClick={() => setDialogOpen(true)}>{t("projects.new")}</Button>
        ) : null}
      </header>

      {!organizationId ? (
        <p className="rounded-xl border bg-card p-5 text-muted-foreground text-sm">
          {t("projects.noWorkspace")}{" "}
          <Link
            className="font-medium text-primary underline-offset-4 hover:underline"
            to="/workspace"
          >
            {t("projects.selectWorkspace")}
          </Link>
        </p>
      ) : null}

      {organizationId && projectsQuery.isPending ? (
        <p className="text-muted-foreground text-sm">{t("projects.loading")}</p>
      ) : null}

      {organizationId && projectsQuery.isError ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-5">
          <p className="text-destructive text-sm">{t("projects.loadFailed")}</p>
          <Button onClick={() => void projectsQuery.refetch()} variant="outline">
            {t("error.retry")}
          </Button>
        </div>
      ) : null}

      {organizationId && projectsQuery.isSuccess && projects.length === 0 ? (
        <div className="flex flex-col items-start gap-3 rounded-xl border border-dashed bg-card p-8">
          <div className="flex flex-col gap-1">
            <h2 className="font-medium text-sm">{t("projects.empty.title")}</h2>
            <p className="text-muted-foreground text-sm">{t("projects.empty.description")}</p>
          </div>
          <Button onClick={() => setDialogOpen(true)}>{t("projects.new")}</Button>
        </div>
      ) : null}

      {projects.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {projects.map((project) => (
            <li className="flex flex-col gap-2 rounded-xl border bg-card p-5" key={project.id}>
              <div className="flex items-start justify-between gap-3">
                <h2 className="font-medium text-sm">{project.name}</h2>
                <span className="shrink-0 rounded-md bg-muted px-2 py-0.5 font-mono text-xs">
                  {project.key}
                </span>
              </div>
              <p className="text-muted-foreground text-sm">
                {project.description || t("projects.noDescription")}
              </p>
            </li>
          ))}
        </ul>
      ) : null}

      {organizationId ? (
        <CreateProjectDialog
          onOpenChange={setDialogOpen}
          open={dialogOpen}
          organizationId={organizationId}
        />
      ) : null}
    </div>
  );
}
