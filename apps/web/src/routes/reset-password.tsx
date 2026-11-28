import { type ResetPasswordInput, resetPasswordSchema } from "@repo/shared";
import { Button } from "@repo/ui";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { FormTextField } from "@/components/form/form-text-field";
import { useZodForm } from "@/components/form/use-zod-form";
import { PublicPageControls } from "@/components/public-page-controls";
import { authClient } from "@/lib/auth-client";

const resetPasswordSearchSchema = z.object({
  token: z.string().optional(),
});

export const Route = createFileRoute("/reset-password")({
  validateSearch: resetPasswordSearchSchema,
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { token } = Route.useSearch();
  const form = useZodForm<ResetPasswordInput>(resetPasswordSchema, {
    defaultValues: { newPassword: "", confirmPassword: "" },
  });

  async function onSubmit(values: ResetPasswordInput) {
    if (!token) {
      return;
    }

    const { error } = await authClient.resetPassword({
      newPassword: values.newPassword,
      token,
    });

    if (error) {
      toast.error(t("auth.reset.failed"));
      return;
    }

    toast.success(t("auth.reset.success"));
    navigate({ to: "/login", replace: true });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <PublicPageControls />
      <div className="rounded-xl border bg-card p-6 shadow-xs">
        <header className="flex flex-col gap-1">
          <h1 className="font-semibold text-2xl tracking-tight">{t("auth.reset.title")}</h1>
          <p className="text-muted-foreground text-sm">{t("auth.reset.subtitle")}</p>
        </header>

        {token ? (
          <form
            className="mt-5 flex flex-col gap-5"
            noValidate
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FormTextField
              autoComplete="new-password"
              form={form}
              label={t("auth.reset.newPassword")}
              name="newPassword"
              type="password"
            />
            <FormTextField
              autoComplete="new-password"
              form={form}
              label={t("auth.reset.confirmPassword")}
              name="confirmPassword"
              type="password"
            />

            <Button disabled={form.formState.isSubmitting} type="submit">
              {form.formState.isSubmitting ? t("auth.reset.submitting") : t("auth.reset.submit")}
            </Button>
          </form>
        ) : (
          <div className="mt-5 flex flex-col gap-4">
            <p className="text-destructive text-sm" role="alert">
              {t("auth.reset.missingToken")}
            </p>
            <Link
              className="font-medium text-primary text-sm underline-offset-4 hover:underline"
              to="/forgot-password"
            >
              {t("auth.reset.requestNew")}
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}
