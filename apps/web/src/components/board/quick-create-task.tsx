import { createTaskSchema, type TaskStatus } from "@repo/shared";
import { Input } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useZodForm } from "@/components/form/use-zod-form";
import { createTask, moveTask } from "@/lib/api/tasks";
import { queryKeys } from "@/lib/query-keys";
import { useActiveWorkspace } from "@/lib/use-active-workspace";

interface QuickCreateTaskProps {
  projectId: string;
  status: TaskStatus;
  /** Current first card of the column; the new task is placed above it. */
  headTaskId: string | null;
  onClose: () => void;
}

const titleSchema = createTaskSchema.pick({ title: true });

export function QuickCreateTask({ projectId, status, headTaskId, onClose }: QuickCreateTaskProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const organizationId = useActiveWorkspace().data?.id ?? "";
  const form = useZodForm(titleSchema, { defaultValues: { title: "" } });

  async function onSubmit(values: { title: string }) {
    try {
      const created = await createTask({ title: values.title, projectId, status });

      if (headTaskId) {
        await moveTask(created.id, {
          status,
          previousTaskId: null,
          nextTaskId: headTaskId,
        });
      }

      form.reset();
      await queryClient.invalidateQueries({
        queryKey: queryKeys.tasks.all(organizationId, projectId),
      });
      onClose();
    } catch {
      toast.error(t("board.createFailed"));
    }
  }

  const titleError = form.formState.errors.title?.message;

  return (
    <form className="flex flex-col gap-1 px-1" noValidate onSubmit={form.handleSubmit(onSubmit)}>
      <Input
        aria-label={t("board.addTask")}
        autoFocus
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            onClose();
          }
        }}
        placeholder={t("board.createPlaceholder")}
        {...form.register("title")}
      />
      {typeof titleError === "string" ? (
        <p className="text-destructive text-xs">{titleError}</p>
      ) : null}
    </form>
  );
}
