import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../locales/i18n";
import { useUiStore } from "./ui-store";

const STORAGE_KEY = "collab-board.ui";

function readPersistedState(): Record<string, unknown> {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  return raw ? (JSON.parse(raw).state as Record<string, unknown>) : {};
}

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  useUiStore.setState({
    language: "zh-CN",
    sidebarCollapsed: false,
    activeTaskId: null,
    commandPaletteOpen: false,
  });
});

describe("ui-store", () => {
  it("persists the selected language and drives i18next", async () => {
    useUiStore.getState().setLanguage("en-US");

    expect(useUiStore.getState().language).toBe("en-US");

    await vi.waitFor(() => {
      expect(i18n.language).toBe("en-US");
    });

    expect(window.localStorage.getItem(STORAGE_KEY)).toContain("en-US");
  });

  it("mirrors language changes triggered outside the store", async () => {
    await i18n.changeLanguage("en-US");

    expect(useUiStore.getState().language).toBe("en-US");
  });

  it("starts with an expanded sidebar, no drawer and a closed palette", () => {
    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    expect(useUiStore.getState().activeTaskId).toBeNull();
    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
  });

  it("toggles the sidebar and persists the preference", () => {
    useUiStore.getState().toggleSidebar();

    expect(useUiStore.getState().sidebarCollapsed).toBe(true);
    expect(readPersistedState().sidebarCollapsed).toBe(true);

    useUiStore.getState().setSidebarCollapsed(false);

    expect(useUiStore.getState().sidebarCollapsed).toBe(false);
    expect(readPersistedState().sidebarCollapsed).toBe(false);
  });

  it("tracks the active task without persisting it", () => {
    useUiStore.getState().setActiveTaskId("task_1");

    expect(useUiStore.getState().activeTaskId).toBe("task_1");
    expect(readPersistedState()).not.toHaveProperty("activeTaskId");

    useUiStore.getState().setActiveTaskId(null);

    expect(useUiStore.getState().activeTaskId).toBeNull();
  });

  it("opens and closes the command palette without persisting it", () => {
    useUiStore.getState().setCommandPaletteOpen(true);

    expect(useUiStore.getState().commandPaletteOpen).toBe(true);
    expect(readPersistedState()).not.toHaveProperty("commandPaletteOpen");

    useUiStore.getState().setCommandPaletteOpen(false);

    expect(useUiStore.getState().commandPaletteOpen).toBe(false);
  });
});
