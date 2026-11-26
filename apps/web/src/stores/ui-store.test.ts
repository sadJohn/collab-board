import { beforeEach, describe, expect, it, vi } from "vitest";

import i18n from "../locales/i18n";
import { useUiStore } from "./ui-store";

beforeEach(async () => {
  await i18n.changeLanguage("zh-CN");
  useUiStore.setState({ language: "zh-CN" });
});

describe("ui-store", () => {
  it("persists the selected language and drives i18next", async () => {
    useUiStore.getState().setLanguage("en-US");

    expect(useUiStore.getState().language).toBe("en-US");

    await vi.waitFor(() => {
      expect(i18n.language).toBe("en-US");
    });

    expect(window.localStorage.getItem("collab-board.ui")).toContain("en-US");
  });

  it("mirrors language changes triggered outside the store", async () => {
    await i18n.changeLanguage("en-US");

    expect(useUiStore.getState().language).toBe("en-US");
  });
});
