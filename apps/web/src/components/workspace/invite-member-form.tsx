import { type InviteMemberInput, inviteMemberSchema } from "@repo/shared";
import { Button } from "@repo/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { authClient } from "../../lib/auth-client";
import { FormTextField } from "../form/form-text-field";
import { useZodForm } from "../form/use-zod-form";

interface InviteMemberFormProps {
  organizationId: string | undefined;
}

export function InviteMemberForm({ organizationId }: InviteMemberFormProps) {
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const form = useZodForm(inviteMemberSchema, { defaultValues: { email: "" } });

  async function onSubmit(values: InviteMemberInput) {
    if (!organizationId) {
      return;
    }

    setFormError(null);
    setSentTo(null);

    const { error } = await authClient.organization.inviteMember({
      email: values.email,
      role: "member",
      organizationId,
    });

    if (error) {
      setFormError(error.message || t("workspace.invite.failed"));
      return;
    }

    form.reset();
    setSentTo(values.email);
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <h2 className="font-medium text-sm">{t("workspace.invite.title")}</h2>

      {organizationId ? (
        <form className="flex flex-col gap-4" noValidate onSubmit={form.handleSubmit(onSubmit)}>
          <FormTextField
            autoComplete="email"
            form={form}
            label={t("workspace.invite.email")}
            name="email"
            type="email"
          />

          {formError ? (
            <p className="text-destructive text-sm" role="alert">
              {formError}
            </p>
          ) : null}
          {sentTo ? (
            <p className="text-sm text-muted-foreground" role="status">
              {t("workspace.invite.sent", { email: sentTo })}
            </p>
          ) : null}

          <Button className="w-fit" disabled={form.formState.isSubmitting} type="submit">
            {form.formState.isSubmitting
              ? t("workspace.invite.submitting")
              : t("workspace.invite.submit")}
          </Button>
        </form>
      ) : (
        <p className="text-muted-foreground text-sm">{t("workspace.invite.needActive")}</p>
      )}
    </section>
  );
}
