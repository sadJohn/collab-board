import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TaskDto } from "@repo/shared";
import { motion } from "motion/react";

import { TaskCard } from "@/components/task/task-card";
import type { UserAvatarUser } from "@/components/user-avatar";

interface SortableTaskCardProps {
  task: TaskDto;
  assignee?: UserAvatarUser;
  /** Disabled while dragging or during the post-drop cooldown to avoid double animation. */
  suppressLayout: boolean;
  onOpen?: () => void;
}

export function SortableTaskCard({
  task,
  assignee,
  suppressLayout,
  onOpen,
}: SortableTaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  return (
    <div
      className={isDragging ? "opacity-40" : undefined}
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      {...attributes}
      {...listeners}
    >
      <motion.div
        className="cursor-grab touch-none active:cursor-grabbing"
        layout={suppressLayout ? false : "position"}
        onClick={onOpen}
        transition={{ duration: 0.15 }}
      >
        <TaskCard assignee={assignee} task={task} />
      </motion.div>
    </div>
  );
}
