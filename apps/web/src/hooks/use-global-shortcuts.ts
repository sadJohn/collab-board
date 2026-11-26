import { useEffect } from "react";

import { useUiStore } from "../stores/ui-store";

const EDITABLE_SELECTOR = "input, textarea, select, [contenteditable='true']";

/** Typing inside a form must never trigger global shortcuts. */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return target.isContentEditable || target.closest(EDITABLE_SELECTOR) !== null;
}

/**
 * The board sets `body[data-task-dragging]` while a card is being dragged so
 * global shortcuts do not fire mid-gesture.
 */
function isTaskDragging(): boolean {
  return document.body.dataset.taskDragging === "true";
}

/**
 * Global keyboard shortcuts for the authenticated shell.
 *
 * - Cmd/Ctrl+K toggles the command palette, unless the user is typing or
 *   dragging a task card.
 * - Escape closes the topmost interaction: command palette first, then the
 *   task detail drawer.
 */
export function useGlobalShortcuts(): void {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        const state = useUiStore.getState();

        if (state.commandPaletteOpen) {
          state.setCommandPaletteOpen(false);
        } else if (state.activeTaskId) {
          state.setActiveTaskId(null);
        }
        return;
      }

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        if (isEditableTarget(event.target) || isTaskDragging()) {
          return;
        }

        event.preventDefault();
        const state = useUiStore.getState();
        state.setCommandPaletteOpen(!state.commandPaletteOpen);
      }
    }

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);
}
