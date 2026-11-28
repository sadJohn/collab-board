import type { AnalyticsDto, AnalyticsEventName, AnalyticsTopEvent } from "@repo/shared";
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
} from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Activity, BarChart3, Users } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";

import { getAnalytics } from "../../lib/api/analytics";
import { queryKeys } from "../../lib/query-keys";
import { useActiveWorkspace } from "../../lib/use-active-workspace";

export function AnalyticsPage() {
  const { t, i18n } = useTranslation();
  const activeOrganization = useActiveWorkspace();
  const organizationId = activeOrganization.data?.id;

  const query = useQuery({
    queryKey: queryKeys.analytics(organizationId ?? ""),
    queryFn: () => getAnalytics(organizationId as string),
    enabled: Boolean(organizationId) && !activeOrganization.isSwitching,
  });

  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }),
    [i18n.language],
  );
  const formatDay = (dayKey: string): string =>
    dayFormatter.format(new Date(`${dayKey}T00:00:00+08:00`));

  const eventLabels = useMemo<Record<AnalyticsEventName, string>>(
    () => ({
      PAGE_VIEW: t("analytics.events.PAGE_VIEW"),
      TASK_CREATED: t("analytics.events.TASK_CREATED"),
      TASK_DRAGGED: t("analytics.events.TASK_DRAGGED"),
      VIEW_SWITCHED: t("analytics.events.VIEW_SWITCHED"),
      COMMAND_PALETTE_OPENED: t("analytics.events.COMMAND_PALETTE_OPENED"),
      AVATAR_UPLOADED: t("analytics.events.AVATAR_UPLOADED"),
    }),
    [t],
  );
  const eventLabel = (name: AnalyticsEventName): string => eventLabels[name];

  if (!organizationId) {
    return (
      <p className="rounded-xl border bg-card p-5 text-muted-foreground text-sm">
        {t("analytics.empty")}{" "}
        <Link
          className="font-medium text-primary underline-offset-4 hover:underline"
          to="/workspace"
        >
          {t("projects.selectWorkspace")}
        </Link>
      </p>
    );
  }

  if (query.isPending) {
    return <p className="text-muted-foreground text-sm">{t("analytics.loading")}</p>;
  }

  if (query.isError) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-5">
        <p className="text-destructive text-sm">{t("analytics.loadFailed")}</p>
        <Link
          className="font-medium text-primary text-sm underline-offset-4 hover:underline"
          to="/home"
        >
          {t("notFound.back")}
        </Link>
      </div>
    );
  }

  const data: AnalyticsDto = query.data;
  const topEvents = [...data.topEvents].sort((a, b) => b.count - a.count);
  const isEmpty = data.summary.totalEvents === 0;

  const featureConfig: ChartConfig = {
    count: { label: t("analytics.featureUsage"), color: "var(--chart-1)" },
  };
  const trendConfig: ChartConfig = {
    events: { label: t("analytics.trendEvents"), color: "var(--chart-1)" },
    users: { label: t("analytics.trendUsers"), color: "var(--chart-2)" },
  };

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-semibold text-2xl tracking-tight">{t("analytics.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("analytics.subtitle")}</p>
      </header>

      {isEmpty ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card p-10 text-center">
          <BarChart3 className="size-8 text-muted-foreground" />
          <p className="font-medium text-sm">{t("analytics.empty")}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <StatCard
              hint={t("analytics.dauHint")}
              icon={<Users className="size-4 text-muted-foreground" />}
              label={t("analytics.dau")}
              value={data.summary.dau}
            />
            <StatCard
              hint={t("analytics.totalEventsHint")}
              icon={<Activity className="size-4 text-muted-foreground" />}
              label={t("analytics.totalEvents")}
              value={data.summary.totalEvents}
            />
          </div>

          <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <div className="flex flex-col gap-0.5">
              <h2 className="font-medium text-sm">{t("analytics.featureUsage")}</h2>
              <p className="text-muted-foreground text-xs">{t("analytics.featureUsageHint")}</p>
            </div>

            {topEvents.length === 0 ? (
              <p className="py-8 text-center text-muted-foreground text-sm">
                {t("analytics.empty")}
              </p>
            ) : (
              <ChartContainer className="h-[320px] w-full" config={featureConfig}>
                <BarChart
                  data={topEvents}
                  layout="vertical"
                  margin={{ top: 8, right: 16, bottom: 0, left: 8 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" />
                  <XAxis allowDecimals={false} axisLine={false} tickLine={false} type="number" />
                  <YAxis
                    axisLine={false}
                    dataKey="eventName"
                    tickFormatter={(value: AnalyticsEventName) => eventLabel(value)}
                    tickLine={false}
                    type="category"
                    width={130}
                  />
                  <ChartTooltip
                    content={(props: TooltipProps<number, string>) => (
                      <FeatureTooltipContent {...props} />
                    )}
                    cursor={{ fill: "var(--muted)" }}
                  />
                  <Bar dataKey="count" fill="var(--chart-1)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </section>

          <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
            <div className="flex flex-col gap-0.5">
              <h2 className="font-medium text-sm">{t("analytics.trend")}</h2>
              <p className="text-muted-foreground text-xs">{t("analytics.trendHint")}</p>
            </div>

            <ChartContainer className="h-[280px] w-full" config={trendConfig}>
              <LineChart data={data.trend} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis
                  axisLine={false}
                  dataKey="date"
                  tickFormatter={formatDay}
                  tickLine={false}
                  tickMargin={8}
                />
                <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={28} />
                <ChartTooltip
                  content={(props: TooltipProps<number, string>) => (
                    <TrendTooltipContent {...props} formatDay={formatDay} />
                  )}
                />
                <Line
                  dataKey="events"
                  dot={false}
                  name={t("analytics.trendEvents")}
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  type="monotone"
                />
                <Line
                  dataKey="users"
                  dot={false}
                  name={t("analytics.trendUsers")}
                  stroke="var(--chart-2)"
                  strokeWidth={2}
                  type="monotone"
                />
                <ChartLegend content={<ChartLegendContent />} />
              </LineChart>
            </ChartContainer>
          </section>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  hint,
  value,
  icon,
}: {
  label: string;
  hint: string;
  value: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 text-muted-foreground text-xs">
        {icon}
        <span>{label}</span>
      </div>
      <span className="font-semibold text-3xl tabular-nums">{value.toLocaleString()}</span>
      <span className="text-muted-foreground text-xs">{hint}</span>
    </div>
  );
}

function FeatureTooltipContent(props: TooltipProps<number, string>) {
  const { t } = useTranslation();
  const { active, payload } = props;

  if (!active || !payload?.length) {
    return null;
  }

  const row = payload[0]?.payload as AnalyticsTopEvent | undefined;
  if (!row) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <span className="font-medium">{t(`analytics.events.${row.eventName}`)}</span>
      <span className="text-muted-foreground tabular-nums">{row.count.toLocaleString()}</span>
    </div>
  );
}

function TrendTooltipContent({
  active,
  payload,
  label,
  formatDay,
}: TooltipProps<number, string> & { formatDay: (dayKey: string) => string }) {
  const { t } = useTranslation();

  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <span className="font-medium">
        {typeof label === "string" ? formatDay(label) : String(label ?? "")}
      </span>
      {payload.map((item) => (
        <span
          className="flex items-center justify-between gap-3 text-muted-foreground"
          key={String(item.dataKey)}
        >
          <span className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-[2px]"
              style={{ backgroundColor: item.color ?? "var(--chart-1)" }}
            />
            {item.dataKey === "events" ? t("analytics.trendEvents") : t("analytics.trendUsers")}
          </span>
          <span className="font-medium text-foreground tabular-nums">
            {String(item.value ?? 0)}
          </span>
        </span>
      ))}
    </div>
  );
}
