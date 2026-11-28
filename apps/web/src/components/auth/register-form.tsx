import { type SignUpInput, signUpSchema } from "@repo/shared";
import { Button } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FormTextField } from "@/components/form/form-text-field";
import { useZodForm } from "@/components/form/use-zod-form";
import { authClient } from "@/lib/auth-client";
import { queryKeys } from "@/lib/query-keys";
import { GithubSignInButton } from "./github-sign-in-button";

interface RegisterFormProps {
  onSuccess: () => void;
}

export function RegisterForm({ onSuccess }: RegisterFormProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const form = useZodForm(signUpSchema, {
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: SignUpInput) {
    // BetterAuth requires a display name; derive it until profile editing exists.
    const name = values.email.split("@")[0] ?? values.email;
    const { error } = await authClient.signUp.email({
      ...values,
      name,
      // Verification emails sent on sign-up land back on the protected home
      // page (BetterAuth defaults to "/" on the API origin otherwise).
      callbackURL: `${window.location.origin}/home`,
    });

    if (error) {
      toast.error(error.message || t("auth.signUp.failed"));
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

      <Button disabled={form.formState.isSubmitting} type="submit">
        {form.formState.isSubmitting ? t("auth.signUp.submitting") : t("auth.signUp.submit")}
      </Button>

      <div className="flex items-center gap-3 text-muted-foreground text-xs">
        <span className="h-px flex-1 bg-border" />
        {t("auth.github.or")}
        <span className="h-px flex-1 bg-border" />
      </div>

      <GithubSignInButton onError={(message) => toast.error(message)} />
    </form>
  );
}
