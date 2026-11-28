import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { z } from "zod";

import { LoginForm } from "@/components/auth/login-form";
import { PublicPageControls } from "@/components/public-page-controls";
import { redirectIfAuthenticated } from "@/lib/route-guards";

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  beforeLoad: ({ context }) => redirectIfAuthenticated(context.queryClient),
  component: LoginPage,
});

function LoginPage() {
  const { t } = useTranslation();
  const { redirect: redirectTo } = Route.useSearch();
  const navigate = useNavigate();

  function handleSuccess() {
    if (redirectTo) {
      // `redirectTo` is an internal href captured by the route guard; pushing it
      // through the router (history.push bypasses router state) is required.
      navigate({ href: redirectTo, replace: true });
      return;
    }

    navigate({ to: "/dashboard" });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center gap-6 px-6">
      <PublicPageControls />
      <div className="rounded-xl border bg-card p-6 shadow-xs">
        <LoginForm onSuccess={handleSuccess} />
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
