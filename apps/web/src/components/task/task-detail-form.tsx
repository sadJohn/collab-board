import { zodResolver } from "@hookform/resolvers/zod";
import {
  TASK_PRIORITIES,
  TASK_STATUSES,
  type TaskDto,
  type UpdateTaskData,
  updateTaskSchema,
} from "@repo/shared";
import { Button } from "@repo/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Controller, type Resolver, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import type { z } from "zod";
import { FormTextField } from "@/components/form/form-text-field";
import { FormTextareaField } from "@/components/form/form-textarea-field";
import { UserAvatar } from "@/components/user-avatar";
import { listMembers } from "@/lib/api/members";
import { updateTask } from "@/lib/api/tasks";
import { MEMBERS_STALE_TIME_MS, queryKeys } from "@/lib/query-keys";
import { useActiveWorkspace } from "@/lib/use-active-workspace";

type TaskFormValues = z.infer<typeof updateTaskSchema>;

const SELECT_CLASS =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50";

function toDateInputValue(value: Date | string | null | undefined): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

interface TaskDetailFormProps {
  task: TaskDto;
}

export function TaskDetailForm({ task }: TaskDetailFormProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data, isSwitching } = useActiveWorkspace();
  const organizationId = data?.id ?? "";

  const membersQuery = useQuery({
    queryKey: queryKeys.members.list(organizationId),
    queryFn: () => listMembers(organizationId),
    enabled: Boolean(organizationId) && !isSwitching,
    staleTime: MEMBERS_STALE_TIME_MS,
  });

  const form = useForm<TaskFormValues>({
    // `updateTaskSchema` coerces the date input, so its input type is wider
    // than the parsed `TaskFormValues`; the resolver still returns parsed values.
    resolver: zodResolver(updateTaskSchema) as unknown as Resolver<TaskFormValues>,
    defaultValues: {
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority,
      assigneeId: task.assigneeId,
      dueDate: task.dueDate ? new Date(task.dueDate) : null,
    },
  });

  const detailKey = queryKeys.tasks.detail(task.id);

  const mutation = useMutation({
    mutationFn: (values: UpdateTaskData) => updateTask(task.id, values),
    onMutate: async (values) => {
      await queryClient.cancelQueries({ queryKey: detailKey });
      const snapshot = queryClient.getQueryData<TaskDto>(detailKey);

      if (snapshot) {
        queryClient.setQueryData<TaskDto>(detailKey, {
          ...snapshot,
          ...values,
          description: values.description ?? null,
          assigneeId: values.assigneeId ?? null,
          dueDate: values.dueDate ? new Date(values.dueDate).toISOString() : null,
          updatedAt: new Date().toISOString(),
        });
      }

      return { snapshot };
    },
    onError: (_error, _values, context) => {
      if (context?.snapshot) {
        queryClient.setQueryData<TaskDto>(detailKey, context.snapshot);
      }
      toast.error(t("task.saveFailed"));
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<TaskDto>(detailKey, updated);
    },
    onSettled: async () => {
      // Keep the board and list in sync even while the drawer is open.
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: detailKey }),
        queryClient.invalidateQueries({
          queryKey: queryKeys.tasks.all(organizationId, task.projectId),
        }),
      ]);
    },
  });

  async function onSubmit(values: TaskFormValues) {
    try {
      await mutation.mutateAsync({
        title: values.title,
        description: values.description?.trim() ? values.description : null,
        status: values.status,
        priority: values.priority,
        assigneeId: values.assigneeId ? values.assigneeId : null,
        dueDate: values.dueDate ?? null,
      });
    } catch {
      // The mutation's onError already restored the optimistic cache.
    }
  }

  const members = membersQuery.data ?? [];
  const watchedAssigneeId = form.watch("assigneeId");
  const selectedAssignee = watchedAssigneeId
    ? members.find((member) => member.userId === watchedAssigneeId)
    : undefined;

  return (
    <form
      className="flex flex-col gap-4 border-b px-5 py-4"
      noValidate
      onSubmit={form.handleSubmit(onSubmit)}
    >
      <FormTextField form={form} label={t("task.fields.title")} name="title" />
      <FormTextareaField form={form} label={t("task.fields.description")} name="description" />

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-sm" htmlFor="task-status">
            {t("task.fields.status")}
          </label>
          <select className={SELECT_CLASS} id="task-status" {...form.register("status")}>
            {TASK_STATUSES.map((status) => (
              <option key={status} value={status}>
                {t(`taskStatus.${status}`)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="font-medium text-sm" htmlFor="task-priority">
            {t("task.fields.priority")}
          </label>
          <select className={SELECT_CLASS} id="task-priority" {...form.register("priority")}>
            {TASK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {t(`taskPriority.${priority}`)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-center gap-2">
          {selectedAssignee ? <UserAvatar size="sm" user={selectedAssignee} /> : null}
          <label className="font-medium text-sm" htmlFor="task-assignee">
            {t("task.fields.assignee")}
          </label>
        </div>
        <Controller
          control={form.control}
          name="assigneeId"
          render={({ field }) => (
            <select
              className={SELECT_CLASS}
              id="task-assignee"
              onBlur={field.onBlur}
              onChange={(event) => field.onChange(event.target.value || null)}
              ref={field.ref}
              value={field.value ?? ""}
            >
              <option value="">{t("task.fields.unassigned")}</option>
              {members.map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.name}
                </option>
              ))}
            </select>
          )}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="font-medium text-sm" htmlFor="task-due-date">
          {t("task.fields.dueDate")}
        </label>
        <Controller
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <input
              className={SELECT_CLASS}
              id="task-due-date"
              onBlur={field.onBlur}
              onChange={(event) =>
                field.onChange(
                  event.target.value ? new Date(`${event.target.value}T00:00:00.000Z`) : null,
                )
              }
              ref={field.ref}
              type="date"
              value={toDateInputValue(field.value)}
            />
          )}
        />
      </div>

      <div className="flex justify-end">
        <Button disabled={mutation.isPending} type="submit">
          {mutation.isPending ? t("task.saving") : t("task.save")}
        </Button>
      </div>
    </form>
  );
}
