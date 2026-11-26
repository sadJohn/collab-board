import type { TaskDto } from "@repo/shared";
import { useTranslation } from "react-i18next";

interface TaskCardProps {
  task: TaskDto;
  assigneeName?: string;
}

/** Presentational card shared by the sortable list and the drag overlay. */
export function TaskCard({ task, assigneeName }: TaskCardProps) {
  const { t, i18n } = useTranslation();
  const dueDate = task.dueDate
    ? new Intl.DateTimeFormat(i18n.language, { month: "short", day: "numeric" }).format(
        new Date(task.dueDate),
      )
    : null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border bg-background p-3 shadow-xs">
      <p className="font-medium text-sm">{task.title}</p>
      <div className="flex flex-wrap items-center gap-2 text-muted-foreground text-xs">
        <span className="rounded bg-muted px-1.5 py-0.5">{t(`taskPriority.${task.priority}`)}</span>
        {assigneeName ? <span className="truncate">{assigneeName}</span> : null}
        {dueDate ? <span>{dueDate}</span> : null}
      </div>
    </div>
  );
}
