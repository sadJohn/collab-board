import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { DeleteProjectDialog } from "@/components/project/delete-project-dialog";
import { ProjectSettingsPanel } from "@/components/project/project-settings-panel";
import { getProject } from "@/lib/api/projects";
import { ApiError } from "@/lib/api-client";
import { useActiveOrganization, useSession } from "@/lib/auth-client";
import { queryKeys } from "@/lib/query-keys";
import { useActiveWorkspace } from "@/lib/use-active-workspace";
import { canManageProjects } from "@/lib/workspace-permissions";

export const Route = createFileRoute("/_app/projects/$projectId/settings")({
  component: ProjectSettingsPage,
});

function ProjectSettingsPage() {
  const { projectId } = Route.useParams();
  const { t } = useTranslation();
  const activeOrganization = useActiveWorkspace();
  const organizationId = activeOrganization.data?.id;
  const session = useSession();
  const fullOrganization = useActiveOrganization();

  const projectQuery = useQuery({
    queryKey: queryKeys.projects.detail(organizationId ?? "", projectId),
    queryFn: () => getProject(projectId),
    enabled: Boolean(organizationId) && !activeOrganization.isSwitching,
  });
  const project = projectQuery.data;

  // The hydrated organization must belong to this project's workspace; during a
  // workspace switch the previous organization's members stay hydrated briefly.
  const hydratedOrganization =
    project && fullOrganization.data?.id === project.organizationId ? fullOrganization.data : null;
  const resolved = Boolean(
    project &&
      hydratedOrganization &&
      !session.isPending &&
      !fullOrganization.isPending &&
      !fullOrganization.error,
  );
  const currentMember = hydratedOrganization?.members.find(
    (member) => member.userId === session.data?.user.id,
  );
  const canManage = canManageProjects(currentMember?.role);

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
      <ProjectSettingsPanel canManage={canManage} project={project} resolved={resolved} />
      {resolved && canManage ? <DeleteProjectDialog project={project} /> : null}
    </div>
  );
}
