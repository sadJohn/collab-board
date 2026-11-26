import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

import { LoginForm } from "../components/auth/login-form";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <div className="rounded-xl border bg-card p-6 shadow-xs">
        <LoginForm onSuccess={() => navigate({ to: "/home" })} />
      </div>
      <p className="text-center text-muted-foreground text-sm">
        {t("auth.signIn.noAccount")}{" "}
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          to="/register"
        >
          {t("auth.signIn.toRegister")}
        </Link>
      </p>
    </main>
  );
}
