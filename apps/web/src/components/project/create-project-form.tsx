import { type CreateProjectData, createProjectSchema } from "@repo/shared";
import { Button } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { createProject } from "../../lib/api/projects";
import { toApiError } from "../../lib/api-client";
import { queryKeys } from "../../lib/query-keys";
import { FormTextField } from "../form/form-text-field";
import { FormTextareaField } from "../form/form-textarea-field";
import { useZodForm } from "../form/use-zod-form";

interface CreateProjectFormProps {
  organizationId: string;
  onCreated: () => void;
}

export function CreateProjectForm({ organizationId, onCreated }: CreateProjectFormProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(createProjectSchema, {
    defaultValues: { name: "", key: "", description: "" },
  });

  async function onSubmit(values: CreateProjectData) {
    setFormError(null);

    try {
      await createProject(values);
    } catch (error) {
      const apiError = toApiError(error);
      setFormError(
        apiError.status === 409 ? t("projects.create.keyExists") : t("projects.create.failed"),
      );
      return;
    }

    form.reset();
    // The list is keyed by organization, so invalidating the scope refreshes it.
    await queryClient.invalidateQueries({ queryKey: queryKeys.projects.all(organizationId) });
    onCreated();
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

      {formError ? (
        <p className="text-destructive text-sm" role="alert">
          {formError}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          disabled={form.formState.isSubmitting}
          onClick={() => form.reset()}
          type="button"
          variant="ghost"
        >
          {t("projects.create.reset")}
        </Button>
        <Button disabled={form.formState.isSubmitting} type="submit">
          {form.formState.isSubmitting
            ? t("projects.create.submitting")
            : t("projects.create.submit")}
        </Button>
      </div>
    </form>
  );
}
