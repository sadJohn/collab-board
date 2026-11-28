import { type CreateOrganizationInput, createOrganizationSchema } from "@repo/shared";
import { Button } from "@repo/ui";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FormTextField } from "@/components/form/form-text-field";
import { useZodForm } from "@/components/form/use-zod-form";
import { authClient } from "@/lib/auth-client";

interface CreateOrganizationFormProps {
  onCreated: () => Promise<void>;
  onCancel?: () => void;
}

export function CreateOrganizationForm({ onCreated, onCancel }: CreateOrganizationFormProps) {
  const { t } = useTranslation();
  const form = useZodForm(createOrganizationSchema, {
    defaultValues: { name: "", slug: "" },
  });

  async function onSubmit(values: CreateOrganizationInput) {
    const { data, error } = await authClient.organization.create(values);

    if (error || !data) {
      toast.error(error?.message || t("workspace.create.failed"));
      return;
    }

    form.reset();
    toast.success(t("workspace.create.success"));
    await onCreated();
  }

  return (
    <form
      aria-label={t("workspace.create.title")}
      className="flex flex-col gap-4"
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FormTextField
        idPrefix="create-organization"
        form={form}
        label={t("workspace.create.name")}
        name="name"
      />
      <FormTextField
        description={t("workspace.create.slugHint")}
        form={form}
        idPrefix="create-organization"
        label={t("workspace.create.slug")}
        name="slug"
      />

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button onClick={onCancel} type="button" variant="outline">
            {t("workspace.create.cancel")}
          </Button>
        ) : null}
        <Button disabled={form.formState.isSubmitting} type="submit">
          {form.formState.isSubmitting
            ? t("workspace.create.submitting")
            : t("workspace.create.submit")}
        </Button>
      </div>
    </form>
  );
}
