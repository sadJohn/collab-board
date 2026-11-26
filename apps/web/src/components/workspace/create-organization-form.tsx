import { type CreateOrganizationInput, createOrganizationSchema } from "@repo/shared";
import { Button } from "@repo/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { authClient } from "../../lib/auth-client";
import { FormTextField } from "../form/form-text-field";
import { useZodForm } from "../form/use-zod-form";

interface CreateOrganizationFormProps {
  onCreated: () => Promise<void>;
}

export function CreateOrganizationForm({ onCreated }: CreateOrganizationFormProps) {
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(createOrganizationSchema, {
    defaultValues: { name: "", slug: "" },
  });

  async function onSubmit(values: CreateOrganizationInput) {
    setFormError(null);

    const { data, error } = await authClient.organization.create(values);

    if (error || !data) {
      setFormError(error?.message || t("workspace.create.failed"));
      return;
    }

    form.reset();
    await onCreated();
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <h2 className="font-medium text-sm">{t("workspace.create.title")}</h2>

      <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit(onSubmit)}>
        <FormTextField form={form} label={t("workspace.create.name")} name="name" />
        <FormTextField
          description={t("workspace.create.slugHint")}
          form={form}
          label={t("workspace.create.slug")}
          name="slug"
        />

        {formError ? (
          <p className="text-destructive text-sm" role="alert">
            {formError}
          </p>
        ) : null}

        <Button className="w-fit" disabled={form.formState.isSubmitting} type="submit">
          {form.formState.isSubmitting
            ? t("workspace.create.submitting")
            : t("workspace.create.submit")}
        </Button>
      </form>
    </section>
  );
}
