import type { DashboardProject, TaskPriority, TaskStatus } from "@repo/shared";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Flag,
  FolderKanban,
  ListChecks,
  Loader2,
  Plus,
  Sparkles,
} from "lucide-react";
import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useDashboardRealtime } from "../hooks/use-dashboard-realtime";
import { useNotifications } from "../hooks/use-notifications";
import { getDashboard } from "../lib/api/dashboard";
import { useActiveOrganization, useSession } from "../lib/auth-client";
import type { BusinessNotification } from "../lib/notifications";
import { queryKeys } from "../lib/query-keys";
import { useUiStore } from "../stores/ui-store";
import { DashboardCharts } from "./dashboard/dashboard-charts";
import { CreateProjectDialog } from "./project/create-project-dialog";

const STATUS_BADGE: Record<TaskStatus, string> = {
  BACKLOG: "bg-muted text-muted-foreground",
  TODO: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  IN_PROGRESS: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  DONE: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  CANCELED: "bg-muted text-muted-foreground line-through",
};

const PRIORITY_TONE: Record<TaskPriority, string> = {
  LOW: "text-muted-foreground",
  MEDIUM: "text-sky-500",
  HIGH: "text-amber-500",
  URGENT: "text-destructive",
};

function ProgressBar({ project }: { project: DashboardProject }) {
  const { t } = useTranslation();
  const percent =
    project.taskCount === 0 ? 0 : Math.round((project.completedCount / project.taskCount) * 100);

  return (
    <div className="flex flex-col gap-1.5">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <motion.div
          animate={{ width: `${percent}%` }}
          className="h-full rounded-full bg-primary"
          initial={{ width: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        />
      </div>
      <span className="text-muted-foreground text-xs">
        {t("dashboard.projects.progress", {
          completed: project.completedCount,
          total: project.taskCount,
        })}
      </span>
    </div>
  );
}

/** Greeting that follows the visitor's local time of day. */
function resolveGreetingKey(): "morning" | "afternoon" | "evening" {
  const hour = new Date().getHours();
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}

export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const session = useSession();
  const activeOrganization = useActiveOrganization();
  const organizationId = activeOrganization.data?.id;
  const setActiveTaskId = useUiStore((state) => state.setActiveTaskId);
  const setCommandPaletteOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const [createOpen, setCreateOpen] = useState(false);

  const dashboardQuery = useQuery({
    queryKey: queryKeys.dashboard(organizationId ?? ""),
    queryFn: getDashboard,
    enabled: Boolean(organizationId),
  });

  const { notifications } = useNotifications();
  const dashboard = dashboardQuery.data;
  const stats = dashboard?.stats;
  const myTasks = dashboard?.myTasks ?? [];
  const projects = dashboard?.projects ?? [];
  const recentNotifications = notifications.slice(0, 5);
  const projectIds = useMemo(() => projects.map((project) => project.id), [projects]);

  // Live-refresh every aggregate when a teammate touches a task or comment.
  useDashboardRealtime(projectIds);

  const dateFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }),
    [i18n.language],
  );
  const timeFormatter = useMemo(
    () => new Intl.DateTimeFormat(i18n.language, { dateStyle: "short", timeStyle: "short" }),
    [i18n.language],
  );

  function openTask(projectId: string, taskId: string) {
    setActiveTaskId(taskId);
    void navigate({
      to: "/projects/$projectId/board",
      params: { projectId },
      search: { task: taskId },
    });
  }

  function selectProject(projectId: string) {
    void navigate({ to: "/projects/$projectId/board", params: { projectId } });
  }

  function handleNotificationClick(notification: BusinessNotification) {
    openTask(notification.payload.projectId, notification.payload.taskId);
  }

  const user = session.data?.user;
  const displayName = user?.name ?? user?.email ?? "";
  const workspaceName = activeOrganization.data?.name ?? "";

  const statCards = [
    {
      key: "assigned",
      label: t("dashboard.stats.assigned"),
      value: stats?.assignedCount ?? 0,
      icon: ListChecks,
      tone: "text-sky-500",
    },
    {
      key: "inProgress",
      label: t("dashboard.stats.inProgress"),
      value: stats?.inProgressCount ?? 0,
      icon: CircleDashed,
      tone: "text-amber-500",
    },
    {
      key: "overdue",
      label: t("dashboard.stats.overdue"),
      value: stats?.overdueCount ?? 0,
      icon: AlertTriangle,
      tone: "text-destructive",
    },
    {
      key: "completed",
      label: t("dashboard.stats.completed"),
      value: stats?.completedCount ?? 0,
      icon: CheckCircle2,
      tone: "text-emerald-500",
    },
  ];

  if (!organizationId) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
        <p className="text-muted-foreground text-sm">{t("dashboard.noWorkspace")}</p>
        <Button onClick={() => void navigate({ to: "/workspace" })}>
          {t("dashboard.goWorkspace")}
          <ArrowRight />
        </Button>
      </div>
    );
  }

  if (dashboardQuery.isPending) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <Loader2 className="size-4 animate-spin" />
        {t("dashboard.loading")}
      </div>
    );
  }

  if (dashboardQuery.isError || !dashboard) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-xl border bg-card p-6">
        <p className="text-destructive text-sm">{t("dashboard.loadFailed")}</p>
        <Button onClick={() => void dashboardQuery.refetch()} variant="outline">
          {t("error.retry")}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <motion.header
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-4"
        initial={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.25 }}
      >
        <div className="flex flex-col gap-1">
          <h1 className="font-semibold text-3xl tracking-tight">
            {t(`dashboard.greeting.${resolveGreetingKey()}`, { name: displayName })}
          </h1>
          {workspaceName ? (
            <span className="w-fit rounded-full border px-3 py-1 text-muted-foreground text-xs">
              {t("dashboard.badge", { workspace: workspaceName })}
            </span>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={() => setCreateOpen(true)}>
            <Plus />
            {t("dashboard.newProject")}
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Sparkles />
                {t("dashboard.newTask")}
                <ChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              <DropdownMenuLabel>{t("dashboard.chooseProject")}</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {projects.length === 0 ? (
                <DropdownMenuItem disabled>{t("dashboard.noProjectsForTask")}</DropdownMenuItem>
              ) : (
                projects.map((project) => (
                  <DropdownMenuItem key={project.id} onSelect={() => selectProject(project.id)}>
                    <span className="font-mono text-muted-foreground text-xs">{project.key}</span>
                    <span className="truncate">{project.name}</span>
                  </DropdownMenuItem>
                ))
              )}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button onClick={() => setCommandPaletteOpen(true)} variant="ghost">
            {t("dashboard.openCommand")}
          </Button>
        </div>
      </motion.header>

      <div className="flex flex-col gap-3">
        <h2 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
          {t("dashboard.stats.title")}
        </h2>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card, index) => {
            const Icon = card.icon;
            return (
              <motion.div
                animate={{ opacity: 1, y: 0 }}
                className="rounded-xl border bg-card p-5 shadow-xs"
                initial={{ opacity: 0, y: 8 }}
                key={card.key}
                transition={{ delay: index * 0.05, duration: 0.25 }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground text-sm">{card.label}</span>
                  <Icon className={`size-4 ${card.tone}`} />
                </div>
                <p className="mt-2 font-semibold text-3xl tabular-nums">{card.value}</p>
              </motion.div>
            );
          })}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3 rounded-xl border bg-card p-5 lg:col-span-2"
          initial={{ opacity: 0, y: 8 }}
          transition={{ duration: 0.25 }}
        >
          <h2 className="font-medium text-sm">{t("dashboard.myTasks.title")}</h2>

          {myTasks.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
              {t("dashboard.myTasks.empty")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y">
              {myTasks.map((task) => {
                const overdue =
                  task.dueDate !== null &&
                  new Date(task.dueDate).getTime() < Date.now() &&
                  task.status !== "DONE" &&
                  task.status !== "CANCELED";

                return (
                  <li key={task.id}>
                    <button
                      className="flex w-full items-center gap-3 py-2.5 text-left transition-colors hover:bg-accent/60"
                      onClick={() => openTask(task.project.id, task.id)}
                      type="button"
                    >
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {task.project.key}
                      </span>
                      <Flag
                        aria-label={t(`taskPriority.${task.priority}`)}
                        className={`size-3.5 shrink-0 ${PRIORITY_TONE[task.priority]}`}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">{task.title}</span>
                      <span
                        className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${STATUS_BADGE[task.status]}`}
                      >
                        {t(`taskStatus.${task.status}`)}
                      </span>
                      {task.dueDate ? (
                        <span
                          className={`shrink-0 text-xs ${
                            overdue ? "text-destructive" : "text-muted-foreground"
                          }`}
                        >
                          {dateFormatter.format(new Date(task.dueDate))}
                        </span>
                      ) : null}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </motion.section>

        <motion.section
          animate={{ opacity: 1, y: 0 }}
          className="flex flex-col gap-3 rounded-xl border bg-card p-5"
          initial={{ opacity: 0, y: 8 }}
          transition={{ delay: 0.05, duration: 0.25 }}
        >
          <h2 className="font-medium text-sm">{t("dashboard.projects.title")}</h2>

          {projects.length === 0 ? (
            <p className="rounded-lg border border-dashed p-6 text-center text-muted-foreground text-sm">
              {t("dashboard.projects.empty")}
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    className="flex w-full flex-col gap-2 rounded-lg border p-3 text-left transition-colors hover:bg-accent/60"
                    onClick={() => selectProject(project.id)}
                    type="button"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
                        <span className="truncate text-sm">{project.name}</span>
                      </span>
                      <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                        {project.key}
                      </span>
                    </div>
                    <ProgressBar project={project} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      </div>

      <DashboardCharts
        statusDistribution={dashboard.statusDistribution}
        weeklyTrend={dashboard.weeklyTrend}
      />

      <motion.section
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col gap-3 rounded-xl border bg-card p-5"
        initial={{ opacity: 0, y: 8 }}
        transition={{ duration: 0.25 }}
      >
        <h2 className="font-medium text-sm">{t("dashboard.activity.title")}</h2>

        {recentNotifications.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t("dashboard.activity.empty")}</p>
        ) : (
          <ul className="flex flex-col divide-y">
            {recentNotifications.map((notification) => (
              <li
                className="flex items-center justify-between gap-3 py-2 text-sm"
                key={notification.id}
              >
                {notification.type === "BUSINESS" ? (
                  <button
                    className="flex min-w-0 flex-1 items-center gap-2 text-left hover:text-primary"
                    onClick={() => handleNotificationClick(notification)}
                    type="button"
                  >
                    <span className="truncate">
                      {t(`notifications.business.${notification.notificationType}`, {
                        actor: notification.payload.actorName,
                      })}
                      <span className="ml-1 text-muted-foreground">
                        · {notification.payload.taskTitle}
                      </span>
                    </span>
                  </button>
                ) : (
                  <Link className="min-w-0 flex-1 truncate hover:text-primary" to="/workspace">
                    <span className="font-medium">{notification.invitation.organizationName}</span>
                    <span className="ml-1 text-muted-foreground">
                      ·{" "}
                      {t("notifications.invitation.text", {
                        email: notification.invitation.email,
                      })}
                    </span>
                  </Link>
                )}
                <span className="shrink-0 text-muted-foreground text-xs">
                  {timeFormatter.format(new Date(notification.createdAt))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </motion.section>

      <CreateProjectDialog
        onOpenChange={setCreateOpen}
        open={createOpen}
        organizationId={organizationId}
      />
    </div>
  );
}
