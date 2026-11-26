import { type SignInInput, signInSchema } from "@repo/shared";
import { Button } from "@repo/ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { authClient } from "../../lib/auth-client";
import { FormTextField } from "../form/form-text-field";
import { useZodForm } from "../form/use-zod-form";

interface LoginFormProps {
  onSuccess: () => void;
}

export function LoginForm({ onSuccess }: LoginFormProps) {
  const { t } = useTranslation();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(signInSchema, {
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignInInput) {
    setFormError(null);

    const { error } = await authClient.signIn.email(values);

    if (error) {
      setFormError(error.message || t("auth.signIn.failed"));
      return;
    }

    onSuccess();
  }

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">{t("auth.signIn.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("auth.signIn.subtitle")}</p>
      </header>

      <FormTextField
        autoComplete="email"
        form={form}
        label={t("auth.email")}
        name="email"
        type="email"
      />
      <FormTextField
        autoComplete="current-password"
        form={form}
        label={t("auth.password")}
        name="password"
        type="password"
      />

      {formError ? (
        <p className="text-destructive text-sm" role="alert">
          {formError}
        </p>
      ) : null}

      <Button disabled={form.formState.isSubmitting} type="submit">
        {form.formState.isSubmitting ? t("auth.signIn.submitting") : t("auth.signIn.submit")}
      </Button>
    </form>
  );
}
