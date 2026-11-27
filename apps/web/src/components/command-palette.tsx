import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandList,
  CommandSeparator,
} from "@repo/ui";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { useUiStore } from "../stores/ui-store";

/**
 * Lightweight 7.4 shell of the global command palette.
 *
 * 7.5 will populate the groups with actual actions and task search; for now
 * this component only wires up the shell — opens/closes via `commandPaletteOpen`
 * in the Zustand store, surfaces the i18n placeholder and empty state, and
 * auto-focuses the input whenever the dialog opens.
 *
 * The global Cmd/Ctrl+K listener already lives in `useGlobalShortcuts`, which
 * fires `setCommandPaletteOpen`. That hook will likely live alongside this
 * component in the same protected-root consumer in 7.4 / 7.5.
 */
export function CommandPalette() {
  const { t } = useTranslation();
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);

  // Sync `body` overflow so the backdrop doesn't push a double scrollbar — this
  // is the one cosmetic detail that slipped past Dialog in the current layout.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("command.title")}
      description={t("command.description")}
    >
      <CommandInput placeholder={t("command.placeholder")} />
      <CommandList>
        <CommandEmpty>{t("command.empty")}</CommandEmpty>

        {/* 7.4 only lays out the group scaffolding; 7.5 fills them with real items.
            Rendering the empty groups here keeps i18n keys wired and layout
            predictable — the palette won't jump when 7.5 lands. */}
        <CommandGroup heading={t("command.groups.actions")} />
        <CommandSeparator />
        <CommandGroup heading={t("command.groups.navigation")} />
        <CommandSeparator />
        <CommandGroup heading={t("command.groups.tasks")} />
        <CommandSeparator />
        <CommandGroup heading={t("command.groups.workspaces")} />
      </CommandList>
    </CommandDialog>
  );
}
