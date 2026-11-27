import { buttonVariants } from "@repo/ui";
import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { useTranslation } from "react-i18next";

import { sessionQueryOptions } from "../lib/session";

/**
 * Public entry. Signed-in users go straight to their workspace dashboard;
 * anonymous visitors see the product landing page.
 */
export const Route = createFileRoute("/")({
  beforeLoad: async ({ context }) => {
    const session = await context.queryClient.query({
      ...sessionQueryOptions,
      staleTime: "static",
    });

    if (session) {
      throw redirect({ to: "/dashboard" });
    }
  },
  component: WelcomePage,
});

function WelcomePage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-2xl flex-col justify-center gap-8 px-6 py-16">
      <div className="flex flex-col gap-4">
        <span className="flex w-fit items-center gap-2 rounded-full border px-3 py-1 font-medium text-muted-foreground text-xs">
          <LayoutDashboard className="size-3.5" />
          {t("app.name")}
        </span>
        <h1 className="font-semibold text-4xl tracking-tight">{t("welcome.title")}</h1>
        <p className="max-w-xl text-muted-foreground">{t("welcome.subtitle")}</p>
      </div>

      <div className="flex flex-wrap gap-3">
        <Link className={buttonVariants({ size: "lg" })} to="/register">
          {t("welcome.getStarted")}
          <ArrowRight />
        </Link>
        <Link className={buttonVariants({ size: "lg", variant: "outline" })} to="/login">
          {t("welcome.signIn")}
        </Link>
      </div>
    </main>
  );
}
