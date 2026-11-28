import type { ProjectDto } from "@repo/shared";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { z } from "zod";

import { FormTextField } from "@/components/form/form-text-field";
import { useZodForm } from "@/components/form/use-zod-form";
import { deleteProject } from "@/lib/api/projects";
import { toApiError } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import { useUiStore } from "@/stores/ui-store";

const confirmationSchema = z.object({ confirmationKey: z.string() });
type ConfirmationValues = z.infer<typeof confirmationSchema>;

interface DeleteProjectDialogProps {
  project: ProjectDto;
}

/**
 * Hard-deletes the current project after typing its key. Any role gating is the
 * caller's responsibility; the server still enforces owner/admin.
 */
export function DeleteProjectDialog({ project }: DeleteProjectDialogProps) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const setActiveTaskId = useUiStore((state) => state.setActiveTaskId);
  const [open, setOpen] = useState(false);
  const deletionInFlight = useRef(false);
  const form = useZodForm(confirmationSchema, {
    defaultValues: { confirmationKey: "" },
  });
  const confirmationKey = form.watch("confirmationKey");
  const canSubmit = confirmationKey.trim() === project.key;

  function handleOpenChange(nextOpen: boolean) {
    if (deletionInFlight.current) return;
    setOpen(nextOpen);
    if (!nextOpen) form.reset();
  }

  async function onSubmit(values: ConfirmationValues) {
    if (values.confirmationKey.trim() !== project.key) {
      form.setError("confirmationKey", {
        type: "validate",
        message: t("projects.settings.deleteMismatch"),
      });
      return;
    }
    if (deletionInFlight.current) return;
    deletionInFlight.current = true;

    try {
      try {
        await deleteProject(project.id);
      } catch (error) {
        // A 404 means the project is already gone; converge as deleted.
        if (toApiError(error).status !== 404) {
          toast.error(t("projects.settings.deleteFailed"));
          return;
        }
      }

      setActiveTaskId(null);
      // Drop the whole project subtree (list, detail, tasks and kanban) before
      // navigating. Invalidating alone would let the cached list render the
      // deleted project once more until the refetch lands.
      queryClient.removeQueries({
        queryKey: queryKeys.projects.all(project.organizationId),
      });

      setOpen(false);
      form.reset();
      toast.success(t("projects.settings.deleteSuccess"));
      void navigate({ to: "/projects" });
    } finally {
      deletionInFlight.current = false;
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-destructive/40 bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-destructive text-sm">
          {t("projects.settings.dangerTitle")}
        </h2>
        <p className="text-muted-foreground text-sm">{t("projects.settings.dangerDescription")}</p>
      </div>

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogTrigger asChild>
          <Button className="w-fit" size="sm" variant="destructive">
            {t("projects.settings.deleteTrigger")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("projects.settings.deleteDialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("projects.settings.deleteWarning", { name: project.name })}
            </DialogDescription>
          </DialogHeader>

          <form
            aria-label={t("projects.settings.deleteFormLabel")}
            className="flex flex-col gap-4"
            noValidate
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FormTextField
              description={t("projects.settings.deleteConfirmationHint", { key: project.key })}
              form={form}
              idPrefix="delete-project"
              label={t("projects.settings.deleteConfirmationLabel")}
              name="confirmationKey"
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button autoFocus type="button" variant="outline">
                  {t("projects.settings.deleteCancel")}
                </Button>
              </DialogClose>
              <Button
                disabled={!canSubmit || form.formState.isSubmitting}
                type="submit"
                variant="destructive"
              >
                {form.formState.isSubmitting
                  ? t("projects.settings.deleteSubmitting")
                  : t("projects.settings.deleteSubmit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
