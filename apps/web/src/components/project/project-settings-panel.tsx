import type { ProjectDto } from "@repo/shared";
import { useTranslation } from "react-i18next";

import { ProjectForm } from "./project-form";

interface ProjectSettingsPanelProps {
  project: ProjectDto;
  /** False until the current member role is known; must fail closed. */
  resolved: boolean;
  canManage: boolean;
}

/**
 * Projects the resolved permission state onto the settings UI: managers get the
 * edit form, members get a read-only notice, and an unresolved role shows
 * neither.
 */
export function ProjectSettingsPanel({ project, resolved, canManage }: ProjectSettingsPanelProps) {
  const { t } = useTranslation();

  if (!resolved) {
    return <p className="text-muted-foreground text-sm">{t("projects.settings.checking")}</p>;
  }

  if (!canManage) {
    return (
      <p className="rounded-xl border bg-card p-5 text-muted-foreground text-sm">
        {t("projects.settings.readOnly")}
      </p>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <h2 className="font-medium text-sm">{t("projects.settings.editTitle")}</h2>
      <ProjectForm
        key={project.id}
        mode="edit"
        organizationId={project.organizationId}
        project={project}
      />
    </section>
  );
}
