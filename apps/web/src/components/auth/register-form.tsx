import { type SignUpInput, signUpSchema } from "@repo/shared";
import { Button } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { authClient } from "../../lib/auth-client";
import { queryKeys } from "../../lib/query-keys";
import { FormTextField } from "../form/form-text-field";
import { useZodForm } from "../form/use-zod-form";

interface RegisterFormProps {
  onSuccess: () => void;
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(signUpSchema, {
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignUpInput) {
    setFormError(null);

    // BetterAuth requires a display name; derive it until profile editing exists.
    const name = values.email.split("@")[0] ?? values.email;
    const { error } = await authClient.signUp.email({ ...values, name });

    if (error) {
      setFormError(error.message || t("auth.signUp.failed"));
      return;
    }

    // Same cache hand-off as sign-in: the guard must see the new session.
    queryClient.removeQueries({ queryKey: queryKeys.session });
    onSuccess();
  }

  return (
    <form className="flex flex-col gap-5" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">{t("auth.signUp.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("auth.signUp.subtitle")}</p>
      </header>

      <FormTextField
        autoComplete="email"
        form={form}
        label={t("auth.email")}
        name="email"
        type="email"
      />
      <FormTextField
        autoComplete="new-password"
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
        {form.formState.isSubmitting ? t("auth.signUp.submitting") : t("auth.signUp.submit")}
      </Button>
    </form>
  );
}
