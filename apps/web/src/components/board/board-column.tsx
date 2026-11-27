import { useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import type { TaskDto, TaskStatus } from "@repo/shared";
import { Button } from "@repo/ui";
import { Plus } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { OrganizationMember } from "../../lib/api/members";
import { QuickCreateTask } from "./quick-create-task";
import { SortableTaskCard } from "./sortable-task-card";

export function boardColumnId(status: TaskStatus): string {
  return `column:${status}`;
}

interface BoardColumnProps {
  status: TaskStatus;
  tasks: TaskDto[];
  projectId: string;
  suppressLayout: boolean;
  membersById: Map<string, OrganizationMember>;
  onOpenTask: (taskId: string) => void;
}

export function BoardColumn({
  status,
  tasks,
  projectId,
  suppressLayout,
  membersById,
  onOpenTask,
}: BoardColumnProps) {
  const { t } = useTranslation();
  const [creating, setCreating] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: boardColumnId(status) });

  return (
    <section className="flex min-w-0 flex-col gap-2 rounded-xl border bg-muted/30 p-2">
      <header className="flex items-center justify-between gap-2 px-1">
        <h2 className="flex items-center gap-2 font-medium text-sm">
          {t(`taskStatus.${status}`)}
          <span className="text-muted-foreground text-xs">{tasks.length}</span>
        </h2>
        <Button
          aria-label={t("board.addTask")}
          onClick={() => setCreating(true)}
          size="icon"
          type="button"
          variant="ghost"
        >
          <Plus />
        </Button>
      </header>

      {creating ? (
        <QuickCreateTask
          headTaskId={tasks[0]?.id ?? null}
          onClose={() => setCreating(false)}
          projectId={projectId}
          status={status}
        />
      ) : null}

      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div
          className={`flex min-h-24 flex-col gap-2 rounded-lg p-1 transition-colors ${
            isOver ? "bg-accent/60" : ""
          }`}
          ref={setNodeRef}
        >
          {tasks.map((task) => (
            <SortableTaskCard
              assignee={membersById.get(task.assigneeId ?? "")}
              key={task.id}
              onOpen={() => onOpenTask(task.id)}
              suppressLayout={suppressLayout}
              task={task}
            />
          ))}

          {tasks.length === 0 ? (
            <p className="px-2 py-6 text-center text-muted-foreground text-xs">
              {t("board.emptyColumn")}
            </p>
          ) : null}
        </div>
      </SortableContext>
    </section>
  );
}
