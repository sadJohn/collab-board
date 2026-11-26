import { TASK_STATUSES } from "@repo/shared";
import { Button } from "@repo/ui";
import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";

export function HomePage() {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <span className="w-fit rounded-full border px-3 py-1 font-medium text-muted-foreground text-xs">
          {t("app.badge")}
        </span>
        <h1 className="font-semibold text-3xl tracking-tight">{t("app.tagline")}</h1>
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
          <div className="rounded-lg border bg-card p-4 shadow-xs" key={status}>
            <p className="font-medium text-sm">{t(`taskStatus.${status}`)}</p>
            <p className="mt-1 font-mono text-muted-foreground text-xs">{status}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
