import {
  type DeleteOrganizationConfirmationInput,
  deleteOrganizationConfirmationSchema,
} from "@repo/shared";
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
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { FormTextField } from "@/components/form/form-text-field";
import { useZodForm } from "@/components/form/use-zod-form";
import { authClient } from "@/lib/auth-client";
import type { ActiveWorkspace } from "@/lib/use-active-workspace";

interface DeleteOrganizationDialogProps {
  organization: ActiveWorkspace;
  onReconcile: (organizationId: string) => Promise<boolean>;
}

export function DeleteOrganizationDialog({
  organization,
  onReconcile,
}: DeleteOrganizationDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const deletionInFlight = useRef(false);
  const form = useZodForm(deleteOrganizationConfirmationSchema, {
    defaultValues: { confirmationSlug: "" },
  });
  const confirmationSlug = form.watch("confirmationSlug");
  const canSubmit = confirmationSlug.trim() === organization.slug;

  function handleOpenChange(nextOpen: boolean) {
    if (deletionInFlight.current) return;
    setOpen(nextOpen);
    if (!nextOpen) form.reset();
  }

  async function onSubmit(values: DeleteOrganizationConfirmationInput) {
    if (values.confirmationSlug !== organization.slug) {
      form.setError("confirmationSlug", {
        type: "validate",
        message: t("workspace.delete.mismatch"),
      });
      return;
    }
    if (deletionInFlight.current) return;
    deletionInFlight.current = true;

    try {
      let requestError: string | undefined;
      try {
        const { error } = await authClient.organization.delete({
          organizationId: organization.id,
        });
        requestError = error?.message;
      } catch {
        // Reconciliation below also covers a lost response after a committed delete.
      }

      let deleted = false;
      try {
        deleted = await onReconcile(organization.id);
      } catch {
        // Without a fresh organization list we cannot safely claim deletion.
      }

      if (!deleted) {
        toast.error(requestError || t("workspace.delete.failed"));
        return;
      }

      setOpen(false);
      form.reset();
      toast.success(t("workspace.delete.success"));
    } finally {
      deletionInFlight.current = false;
    }
  }

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-destructive/40 bg-card p-5">
      <div className="flex flex-col gap-1">
        <h2 className="font-medium text-destructive text-sm">{t("workspace.delete.title")}</h2>
        <p className="text-muted-foreground text-sm">{t("workspace.delete.description")}</p>
      </div>

      <Dialog onOpenChange={handleOpenChange} open={open}>
        <DialogTrigger asChild>
          <Button className="w-fit" size="sm" variant="destructive">
            {t("workspace.delete.trigger")}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("workspace.delete.dialogTitle")}</DialogTitle>
            <DialogDescription>
              {t("workspace.delete.warning", { name: organization.name })}
            </DialogDescription>
          </DialogHeader>

          <form
            aria-label={t("workspace.delete.formLabel")}
            className="flex flex-col gap-4"
            noValidate
            onSubmit={form.handleSubmit(onSubmit)}
          >
            <FormTextField
              description={t("workspace.delete.confirmationHint", {
                slug: organization.slug,
              })}
              form={form}
              idPrefix="delete-organization"
              label={t("workspace.delete.confirmationLabel")}
              name="confirmationSlug"
            />

            <DialogFooter>
              <DialogClose asChild>
                <Button autoFocus type="button" variant="outline">
                  {t("workspace.delete.cancel")}
                </Button>
              </DialogClose>
              <Button
                disabled={!canSubmit || form.formState.isSubmitting}
                type="submit"
                variant="destructive"
              >
                {form.formState.isSubmitting
                  ? t("workspace.delete.submitting")
                  : t("workspace.delete.submit")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
