import { Button } from "@repo/ui";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { CreateOrganizationForm } from "@/components/workspace/create-organization-form";
import { WorkspaceFormDialog } from "@/components/workspace/workspace-form-dialog";

interface CreateOrganizationDialogProps {
  onCreated: () => Promise<void>;
}

export function CreateOrganizationDialog({ onCreated }: CreateOrganizationDialogProps) {
  const { t } = useTranslation();

  return (
    <WorkspaceFormDialog
      description={t("workspace.create.description")}
      title={t("workspace.create.title")}
      trigger={
        <Button className="w-fit" size="sm">
          <Plus className="size-4" />
          {t("workspace.create.title")}
        </Button>
      }
    >
      {(close) => (
        <CreateOrganizationForm
          onCancel={close}
          onCreated={async () => {
            await onCreated();
            close();
          }}
        />
      )}
    </WorkspaceFormDialog>
  );
}
