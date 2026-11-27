import type { DashboardStatusDistribution, DashboardTrendPoint, TaskStatus } from "@repo/shared";
import { type ChartConfig, ChartContainer, ChartTooltip } from "@repo/ui";
import { BarChart3 } from "lucide-react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  type TooltipProps,
  XAxis,
  YAxis,
} from "recharts";

/** Distinct palette per status, sourced from the shared `--chart-*` tokens. */
const STATUS_COLOR: Record<TaskStatus, string> = {
  BACKLOG: "var(--chart-3)",
  TODO: "var(--chart-1)",
  IN_PROGRESS: "var(--chart-4)",
  DONE: "var(--chart-2)",
  CANCELED: "var(--chart-5)",
};

type DashboardChartsProps = {
  statusDistribution: DashboardStatusDistribution[];
  weeklyTrend: DashboardTrendPoint[];
};

export function DashboardCharts({ statusDistribution, weeklyTrend }: DashboardChartsProps) {
  const { t, i18n } = useTranslation();

  const total = useMemo(
    () => statusDistribution.reduce((sum, slice) => sum + slice.count, 0),
    [statusDistribution],
  );

  const slices = useMemo(
    () => statusDistribution.filter((slice) => slice.count > 0),
    [statusDistribution],
  );

  const dayFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }),
    [i18n.language],
  );

  const trendConfig = useMemo<ChartConfig>(
    () => ({
      created: { label: t("dashboard.charts.created"), color: "var(--chart-1)" },
      completed: { label: t("dashboard.charts.completed"), color: "var(--chart-2)" },
    }),
    [t],
  );

  function formatDay(dayKey: string): string {
    return dayFormatter.format(new Date(`${dayKey}T00:00:00+08:00`));
  }

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed bg-card p-10 text-center">
        <BarChart3 className="size-8 text-muted-foreground" />
        <p className="font-medium text-sm">{t("dashboard.charts.empty")}</p>
        <p className="text-muted-foreground text-xs">{t("dashboard.charts.emptyHint")}</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-medium text-sm">{t("dashboard.charts.statusTitle")}</h2>
          <p className="text-muted-foreground text-xs">{t("dashboard.charts.statusSubtitle")}</p>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <ChartContainer className="mx-auto h-[200px] w-full" config={{ count: {} }}>
              <PieChart>
                <ChartTooltip
                  content={(props: TooltipProps<number, string>) => (
                    <StatusTooltipContent {...props} total={total} />
                  )}
                />
                <Pie
                  data={slices}
                  dataKey="count"
                  innerRadius={58}
                  nameKey="status"
                  outerRadius={86}
                  paddingAngle={2}
                  strokeWidth={0}
                >
                  {slices.map((slice) => (
                    <Cell fill={STATUS_COLOR[slice.status]} key={slice.status} />
                  ))}
                </Pie>
              </PieChart>
            </ChartContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-semibold text-2xl tabular-nums">{total}</span>
              <span className="text-muted-foreground text-xs">{t("dashboard.charts.total")}</span>
            </div>
          </div>

          <ul className="flex flex-col gap-1.5 sm:w-40">
            {statusDistribution.map((slice) => (
              <li className="flex items-center justify-between gap-2 text-xs" key={slice.status}>
                <span className="flex items-center gap-1.5">
                  <span
                    className="size-2 rounded-[2px]"
                    style={{ backgroundColor: STATUS_COLOR[slice.status] }}
                  />
                  <span className="text-muted-foreground">{t(`taskStatus.${slice.status}`)}</span>
                </span>
                <span className="font-medium tabular-nums">{slice.count}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="flex flex-col gap-4 rounded-xl border bg-card p-5">
        <div className="flex flex-col gap-0.5">
          <h2 className="font-medium text-sm">{t("dashboard.charts.trendTitle")}</h2>
          <p className="text-muted-foreground text-xs">{t("dashboard.charts.trendSubtitle")}</p>
        </div>

        <ChartContainer className="h-[240px] w-full" config={trendConfig}>
          <BarChart data={weeklyTrend} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
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
            <Bar
              dataKey="created"
              fill="var(--chart-1)"
              name={t("dashboard.charts.created")}
              radius={[4, 4, 0, 0]}
            />
            <Bar
              dataKey="completed"
              fill="var(--chart-2)"
              name={t("dashboard.charts.completed")}
              radius={[4, 4, 0, 0]}
            />
          </BarChart>
        </ChartContainer>

        <div className="flex items-center justify-center gap-4 text-muted-foreground text-xs">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-(--chart-1)" />
            {t("dashboard.charts.created")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-(--chart-2)" />
            {t("dashboard.charts.completed")}
          </span>
        </div>
      </section>
    </div>
  );
}

function StatusTooltipContent({
  active,
  payload,
  total,
}: TooltipProps<number, string> & { total: number }) {
  const { t } = useTranslation();

  if (!active || !payload?.length) {
    return null;
  }

  const slice = payload[0]?.payload as DashboardStatusDistribution | undefined;
  if (!slice) {
    return null;
  }

  const percent = total > 0 ? Math.round((slice.count / total) * 100) : 0;

  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <span className="font-medium">{t(`taskStatus.${slice.status}`)}</span>
      <span className="text-muted-foreground">
        {t("dashboard.charts.count", { count: slice.count })} ·{" "}
        {t("dashboard.charts.percent", { percent })}
      </span>
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
            {item.dataKey === "created"
              ? t("dashboard.charts.created")
              : t("dashboard.charts.completed")}
          </span>
          <span className="font-medium text-foreground tabular-nums">
            {String(item.value ?? 0)}
          </span>
        </span>
      ))}
    </div>
  );
}
