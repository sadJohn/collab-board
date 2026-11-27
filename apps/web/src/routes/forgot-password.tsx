import { type ForgotPasswordInput, forgotPasswordSchema } from "@repo/shared";
import { Button } from "@repo/ui";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { FormTextField } from "../components/form/form-text-field";
import { useZodForm } from "../components/form/use-zod-form";
import { authClient } from "../lib/auth-client";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
});

function ForgotPasswordPage() {
  const { t } = useTranslation();
  const [submitted, setSubmitted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm<ForgotPasswordInput>(forgotPasswordSchema, {
    defaultValues: { email: "" },
  });

  async function onSubmit(values: ForgotPasswordInput) {
    setFormError(null);

    const { error } = await authClient.requestPasswordReset({
      email: values.email,
      redirectTo: `${window.location.origin}/reset-password`,
    });

    if (error) {
      setFormError(t("auth.forgot.failed"));
      return;
    }

    // Never reveal whether the address exists — the same message is shown for
    // registered and unknown emails to prevent account enumeration.
    setSubmitted(true);
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div className="rounded-xl border bg-card p-6 shadow-xs">
        <header className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl tracking-tight">{t("auth.forgot.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("auth.forgot.subtitle")}</p>
        </header>

        {submitted ? (
          <p className="mt-5 text-sm" role="status">
            {t("auth.forgot.sent")}
          </p>
        ) : (
          <form
            className="mt-5 flex flex-col gap-5"
            noValidate
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FormTextField
              autoComplete="email"
              form={form}
              label={t("auth.email")}
              name="email"
              type="email"
            />

            {formError ? (
              <p className="text-destructive text-sm" role="alert">
                {formError}
              </p>
            ) : null}

            <Button disabled={form.formState.isSubmitting} type="submit">
              {form.formState.isSubmitting ? t("auth.forgot.submitting") : t("auth.forgot.submit")}
            </Button>
          </form>
        )}

        <p className="mt-5 text-center text-muted-foreground text-sm">
          <Link className="font-medium text-primary underline-offset-4 hover:underline" to="/login">
            {t("auth.forgot.backToSignIn")}
          </Link>
        </p>
      </div>
    </main>
  );
}
