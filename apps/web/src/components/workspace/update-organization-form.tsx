import { type UpdateOrganizationInput, updateOrganizationSchema } from "@repo/shared";
import { Button } from "@repo/ui";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FormTextField } from "@/components/form/form-text-field";
import { useZodForm } from "@/components/form/use-zod-form";
import { authClient } from "@/lib/auth-client";
import type { ActiveWorkspace } from "@/lib/use-active-workspace";

interface UpdateOrganizationFormProps {
  organization: ActiveWorkspace;
  onUpdated: () => Promise<void>;
  onCancel?: () => void;
}

export function UpdateOrganizationForm({
  organization,
  onUpdated,
  onCancel,
}: UpdateOrganizationFormProps) {
  const { t } = useTranslation();
  const form = useZodForm(updateOrganizationSchema, {
    defaultValues: { name: organization.name, slug: organization.slug },
  });
  const { reset } = form;

  useEffect(() => {
    reset({ name: organization.name, slug: organization.slug });
  }, [organization.name, organization.slug, reset]);

  async function onSubmit(values: UpdateOrganizationInput) {
    const { data, error } = await authClient.organization.update({
      organizationId: organization.id,
      data: { name: values.name, slug: values.slug },
    });

    if (error?.code === "ORGANIZATION_SLUG_ALREADY_TAKEN") {
      form.setError("slug", { type: "server", message: t("workspace.edit.slugTaken") });
      return;
    }

    if (error || !data) {
      toast.error(error?.message || t("workspace.edit.failed"));
      return;
    }

    form.reset(values);
    toast.success(t("workspace.edit.success"));
    await onUpdated();
  }

  return (
    <form
      aria-label={t("workspace.edit.title")}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FormTextField
        form={form}
        idPrefix="update-organization"
        label={t("workspace.create.name")}
        name="name"
      />
      <FormTextField
        description={t("workspace.create.slugHint")}
        form={form}
        idPrefix="update-organization"
        label={t("workspace.create.slug")}
        name="slug"
      />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button onClick={onCancel} type="button" variant="outline">
            {t("workspace.edit.cancel")}
          </Button>
        ) : null}
        <Button disabled={form.formState.isSubmitting} type="submit">
          {form.formState.isSubmitting
            ? t("workspace.edit.submitting")
            : t("workspace.edit.submit")}
        </Button>
      </div>
    </form>
  );
}
