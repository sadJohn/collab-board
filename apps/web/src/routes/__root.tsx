import { Button, TooltipProvider } from "@repo/ui";
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  Link,
  Outlet,
} from "@tanstack/react-router";
import { I18nextProvider, useTranslation } from "react-i18next";

import i18n from "@/locales/i18n";

export interface RouterContext {
  queryClient: QueryClient;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: RootLayout,
  notFoundComponent: NotFoundPage,
  errorComponent: RootErrorBoundary,
});

function RootLayout() {
  const { queryClient } = Route.useRouteContext();

  return (
    <I18nextProvider i18n={i18n}>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider delayDuration={150}>
          <Outlet />
        </TooltipProvider>
      </QueryClientProvider>
    </I18nextProvider>
  );
}

function NotFoundPage() {
  const { t } = useTranslation();

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="text-2xl font-semibold">{t("notFound.title")}</h1>
      <p className="text-muted-foreground">{t("notFound.description")}</p>
      <Link
        className="text-sm font-medium text-primary underline-offset-4 hover:underline"
        to="/home"
      >
        {t("notFound.back")}
      </Link>
    </main>
  );
}

function RootErrorBoundary({ error, reset }: ErrorComponentProps) {
  const { t } = useTranslation();
  const message = error instanceof Error && error.message ? error.message : t("error.description");

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-3 px-6 text-center">
      <h1 className="text-2xl font-semibold">{t("error.title")}</h1>
      <p className="text-muted-foreground">{message}</p>
      <Button variant="outline" onClick={() => reset()}>
        {t("error.retry")}
      </Button>
    </main>
  );
}
