import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { App } from "./app";
import i18n from "./locales/i18n";
import { useUiStore } from "./stores/ui-store";

beforeEach(async () => {
  await i18n.changeLanguage("en-US");
});

describe("App", () => {
  it("renders the homepage copy and all task statuses in English", () => {
    render(<App />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Real-time tasks, without the refresh button.",
    );

    for (const label of ["Backlog", "To do", "In progress", "Done", "Canceled"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("updates every string when the language changes", async () => {
    render(<App />);

    await act(async () => {
      useUiStore.getState().setLanguage("zh-CN");
    });

    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "实时协作任务，无需刷新页面。",
    );

    for (const label of ["待办池", "待处理", "进行中", "已完成", "已取消"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });
});
