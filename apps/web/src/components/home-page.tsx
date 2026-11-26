import { TASK_STATUSES } from "@repo/shared";
import { Button } from "@repo/ui";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { useTranslation } from "react-i18next";

import { LanguageSwitcher } from "./language-switcher";

const apiUrl = import.meta.env.VITE_API_URL || "http://localhost:3000";

export function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="border-b">
        <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-4 px-6">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <LayoutDashboard className="size-4" />
            {t("app.name")}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-xs text-muted-foreground">API · {apiUrl}</span>
            <LanguageSwitcher />
          </div>
        </div>
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-6 py-16">
        <section className="flex flex-col gap-4">
          <span className="w-fit rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
            {t("app.badge")}
          </span>
          <h1 className="text-4xl font-semibold tracking-tight">{t("app.tagline")}</h1>
          <p className="max-w-2xl text-muted-foreground">{t("app.description")}</p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Button>
              {t("app.cta.getStarted")}
              <ArrowRight />
            </Button>
            <Button variant="outline">{t("app.cta.viewBoard")}</Button>
            <Button variant="ghost">{t("app.cta.docs")}</Button>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {TASK_STATUSES.map((status) => (
            <div key={status} className="rounded-lg border bg-card p-4 shadow-xs">
              <p className="text-sm font-medium">{t(`taskStatus.${status}`)}</p>
              <p className="mt-1 font-mono text-xs text-muted-foreground">{status}</p>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
