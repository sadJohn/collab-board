import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { useUiStore } from "../stores/ui-store";
import { useGlobalShortcuts } from "./use-global-shortcuts";

function pressKey(key: string, init: KeyboardEventInit = {}, target: EventTarget = document.body) {
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true, ...init }),
  );
}

beforeEach(() => {
  document.body.removeAttribute("data-task-dragging");
  useUiStore.setState({ activeTaskId: null, commandPaletteOpen: false });
});

describe("useGlobalShortcuts", () => {
  it("toggles the command palette with Cmd/Ctrl+K", () => {
    renderHook(() => useGlobalShortcuts());

    pressKey("k", { ctrlKey: true });
    expect(useUiStore.getState().commandPaletteOpen).toBe(true);

    pressKey("k", { metaKey: true });
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
  });

  it("ignores the shortcut while typing in a form field", () => {
    renderHook(() => useGlobalShortcuts());
    const input = document.createElement("input");
    document.body.append(input);

    pressKey("k", { ctrlKey: true }, input);
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);

    input.remove();
  });

  it("ignores the shortcut while a task is being dragged", () => {
    renderHook(() => useGlobalShortcuts());
    document.body.dataset.taskDragging = "true";

    pressKey("k", { ctrlKey: true });
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
  });

  it("closes the command palette before the drawer on Escape", () => {
    renderHook(() => useGlobalShortcuts());
    useUiStore.setState({ activeTaskId: "task_1", commandPaletteOpen: true });

    pressKey("Escape");

    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
    expect(useUiStore.getState().activeTaskId).toBe("task_1");
  });

  it("closes the task drawer on Escape when the palette is closed", () => {
    renderHook(() => useGlobalShortcuts());
    useUiStore.setState({ activeTaskId: "task_1", commandPaletteOpen: false });

    pressKey("Escape");

    expect(useUiStore.getState().activeTaskId).toBeNull();
  });
});
