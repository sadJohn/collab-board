import { Button } from "@repo/ui";
import { Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { UpdateOrganizationForm } from "@/components/workspace/update-organization-form";
import { WorkspaceFormDialog } from "@/components/workspace/workspace-form-dialog";
import type { ActiveWorkspace } from "@/lib/use-active-workspace";

interface EditOrganizationDialogProps {
  organization: ActiveWorkspace;
  onUpdated: () => Promise<void>;
}

/**
 * Workspace editing lives in a dialog so the settings entry stays compact and
 * the danger zone can sit at the bottom of the page.
 */
export function EditOrganizationDialog({ organization, onUpdated }: EditOrganizationDialogProps) {
  const { t } = useTranslation();

  return (
    <WorkspaceFormDialog
      description={t("workspace.edit.description")}
      title={t("workspace.edit.title")}
      trigger={
        <Button
          aria-label={t("workspace.edit.trigger")}
          className="size-6"
          size="icon"
          title={t("workspace.edit.trigger")}
          variant="ghost"
        >
          <Pencil className="size-3.5" />
        </Button>
      }
    >
      {(close) => (
        <UpdateOrganizationForm
          key={organization.id}
          onCancel={close}
          onUpdated={async () => {
            await onUpdated();
            close();
          }}
          organization={organization}
        />
      )}
    </WorkspaceFormDialog>
  );
}
