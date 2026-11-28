import type { TaskDto } from "@repo/shared";
import { useTranslation } from "react-i18next";

import { UserAvatar, type UserAvatarUser } from "@/components/user-avatar";

interface TaskCardProps {
  task: TaskDto;
  assignee?: UserAvatarUser;
}

/** Presentational card shared by the sortable list and the drag overlay. */
export function TaskCard({ task, assignee }: TaskCardProps) {
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
        {assignee ? (
          <span className="flex min-w-0 items-center gap-1">
            <UserAvatar size="sm" user={assignee} />
            <span className="truncate">{assignee.name ?? assignee.email}</span>
          </span>
        ) : null}
        {dueDate ? <span>{dueDate}</span> : null}
      </div>
    </div>
  );
}
