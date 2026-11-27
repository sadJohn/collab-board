import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { RegisterForm } from "../components/auth/register-form";
import { PublicPageControls } from "../components/public-page-controls";
import { redirectIfAuthenticated } from "../lib/route-guards";

export const Route = createFileRoute("/register")({
  beforeLoad: ({ context }) => redirectIfAuthenticated(context.queryClient),
  component: RegisterPage,
});

function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <PublicPageControls />
      <div className="rounded-xl border bg-card p-6 shadow-xs">
        <RegisterForm onSuccess={() => navigate({ to: "/dashboard" })} />
      </div>
      <p className="text-center text-muted-foreground text-sm">
        {t("auth.signUp.haveAccount")}{" "}
        <Link className="font-medium text-primary underline-offset-4 hover:underline" to="/login">
          {t("auth.signUp.toSignIn")}
        </Link>
      </p>
    </main>
  );
}
