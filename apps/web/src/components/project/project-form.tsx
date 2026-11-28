import { createProjectSchema, type ProjectDto, updateProjectSchema } from "@repo/shared";
import { Button } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { ZodType } from "zod";

import { FormTextField } from "@/components/form/form-text-field";
import { FormTextareaField } from "@/components/form/form-textarea-field";
import { useZodForm } from "@/components/form/use-zod-form";
import { createProject, updateProject } from "@/lib/api/projects";
import { toApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

interface ProjectFormValues {
  name: string;
  key: string;
  description: string | null;
}

interface ProjectFormBaseProps {
  organizationId: string;
  /** Called after a successful submit, e.g. to close a dialog. */
  onSubmitted?: () => void;
  onCancel?: () => void;
}

type ProjectFormProps =
  | (ProjectFormBaseProps & { mode: "create" })
  | (ProjectFormBaseProps & { mode: "edit"; project: ProjectDto });

/**
 * Shared create/edit form so both flows use the same fields, layout, hints and
 * key-conflict handling. Create is driven by `createProjectSchema`; edit by
 * `updateProjectSchema` and prefilled from the current project.
 */
export function ProjectForm(props: ProjectFormProps) {
  const { mode, organizationId, onSubmitted, onCancel } = props;
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const project = mode === "edit" ? props.project : null;

  // Both schemas validate the same three populated fields; the form value type
  // mirrors those fields so one resolver signature serves both modes.
  const schema = (mode === "create"
    ? createProjectSchema
    : updateProjectSchema) as unknown as ZodType<ProjectFormValues, ProjectFormValues>;

  const form = useZodForm(schema, {
    defaultValues: {
      name: project?.name ?? "",
      key: project?.key ?? "",
      description: project?.description ?? "",
    },
  });

  function resetToDefaults() {
    if (project) {
      form.reset({ name: project.name, key: project.key, description: project.description ?? "" });
      return;
    }
    form.reset({ name: "", key: "", description: "" });
  }

  function handleCancel() {
    if (onCancel) {
      onCancel();
      return;
    }
    resetToDefaults();
  }

  async function onSubmit(values: ProjectFormValues) {
    const payload = {
      name: values.name,
      key: values.key,
      description: values.description,
    };

    try {
      if (mode === "create") {
        await createProject(payload);
      } else if (project) {
        await updateProject(project.id, payload);
      }
    } catch (error) {
      const apiError = toApiError(error);
      if (apiError.status === 409) {
        form.setError("key", {
          type: "server",
          message: t("projects.create.keyExists"),
        });
        // Keep the toast used by the create flow for a consistent alert.
        if (mode === "create") toast.error(t("projects.create.keyExists"));
        return;
      }
      toast.error(mode === "create" ? t("projects.create.failed") : t("projects.edit.failed"));
      return;
    }

    toast.success(mode === "create" ? t("projects.create.success") : t("projects.edit.success"));
    await queryClient.invalidateQueries({
      queryKey: queryKeys.projects.all(organizationId),
    });
    if (mode === "edit" && project) {
      await queryClient.invalidateQueries({
        queryKey: queryKeys.projects.detail(organizationId, project.id),
      });
      form.reset(payload);
    } else {
      form.reset({ name: "", key: "", description: "" });
    }
    onSubmitted?.();
  }

  return (
    <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <FormTextField form={form} label={t("projects.create.name")} name="name" />
      <FormTextField
        description={t("projects.create.keyHint")}
        form={form}
        label={t("projects.create.key")}
        name="key"
      />
      <FormTextareaField form={form} label={t("projects.create.description")} name="description" />

      <div className="flex justify-end gap-2">
        <Button
          disabled={form.formState.isSubmitting}
          onClick={handleCancel}
          type="button"
          variant="ghost"
        >
          {mode === "create" ? t("projects.create.reset") : t("projects.edit.cancel")}
        </Button>
        <Button disabled={form.formState.isSubmitting} type="submit">
          {mode === "create"
            ? form.formState.isSubmitting
              ? t("projects.create.submitting")
              : t("projects.create.submit")
            : form.formState.isSubmitting
              ? t("projects.edit.submitting")
              : t("projects.edit.submit")}
        </Button>
      </div>
    </form>
  );
}
