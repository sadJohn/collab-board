import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@repo/ui";
import { type ReactNode, useState } from "react";

interface WorkspaceFormDialogProps {
  /** Element that opens the dialog; rendered as the dialog trigger. */
  trigger: ReactNode;
  title: string;
  description: string;
  /** Receives a callback that closes the dialog, e.g. after a successful submit. */
  children: (close: () => void) => ReactNode;
}

/**
 * Shared shell for the create and edit workspace dialogs so their layout,
 * header and closing behavior stay consistent.
 */
export function WorkspaceFormDialog({
  trigger,
  title,
  description,
  children,
}: WorkspaceFormDialogProps) {
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        {children(close)}
      </DialogContent>
    </Dialog>
  );
}
