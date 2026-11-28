import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@repo/ui";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";

import { getTask } from "@/lib/api/tasks";
import { queryKeys } from "@/lib/query-keys";
import { useUiStore } from "@/stores/ui-store";
import { TaskComments } from "./task-comments";
import { TaskDetailForm } from "./task-detail-form";

/** Task detail drawer; opening/closing is driven by `activeTaskId` in the UI store. */
export function TaskDrawer() {
  const { t } = useTranslation();
  const activeTaskId = useUiStore((state) => state.activeTaskId);
  const setActiveTaskId = useUiStore((state) => state.setActiveTaskId);

  const taskQuery = useQuery({
    queryKey: queryKeys.tasks.detail(activeTaskId ?? ""),
    queryFn: () => getTask(activeTaskId as string),
    enabled: Boolean(activeTaskId),
  });

  const task = taskQuery.data;

  return (
    <Dialog
      onOpenChange={(open) => {
        if (!open) {
          setActiveTaskId(null);
        }
      }}
      open={Boolean(activeTaskId)}
    >
      <DialogContent className="top-0 right-0 bottom-0 left-auto flex h-dvh w-full max-w-md translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none border-l p-0">
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle>{task?.title ?? t("task.drawerTitle")}</DialogTitle>
          <DialogDescription className="sr-only">{t("task.drawerTitle")}</DialogDescription>
        </DialogHeader>

        {taskQuery.isPending ? (
          <p className="px-5 py-4 text-muted-foreground text-sm">{t("task.loading")}</p>
        ) : null}

        {taskQuery.isError ? (
          <p className="px-5 py-4 text-destructive text-sm">{t("task.loadFailed")}</p>
        ) : null}

        {task ? (
          <>
            <TaskDetailForm key={task.id} task={task} />
            <TaskComments taskId={task.id} />
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
