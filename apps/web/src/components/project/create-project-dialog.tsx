import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@repo/ui";
import { useTranslation } from "react-i18next";

import { CreateProjectForm } from "./create-project-form";

interface CreateProjectDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
}

export function CreateProjectDialog({
  open,
  onOpenChange,
  organizationId,
}: CreateProjectDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("projects.create.title")}</DialogTitle>
          <DialogDescription>{t("projects.create.subtitle")}</DialogDescription>
        </DialogHeader>

        <CreateProjectForm onCreated={() => onOpenChange(false)} organizationId={organizationId} />
      </DialogContent>
    </Dialog>
  );
}
