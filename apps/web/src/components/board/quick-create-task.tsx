import { createTaskSchema, type TaskStatus } from "@repo/shared";
import { Input } from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { createTask, moveTask } from "../../lib/api/tasks";
import { queryKeys } from "../../lib/query-keys";
import { useActiveWorkspace } from "../../lib/use-active-workspace";
import { useZodForm } from "../form/use-zod-form";

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
  const [formError, setFormError] = useState<string | null>(null);
  const form = useZodForm(titleSchema, { defaultValues: { title: "" } });

  async function onSubmit(values: { title: string }) {
    setFormError(null);

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
      setFormError(t("board.createFailed"));
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
      {formError ? (
        <p className="text-destructive text-xs" role="alert">
          {formError}
        </p>
      ) : null}
    </form>
  );
}
