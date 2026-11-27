import { afterEach, describe, expect, it } from "vitest";

import { applyTheme, isThemePreference, resolveTheme } from "./theme";

afterEach(() => {
  document.documentElement.classList.remove("dark");
  document.documentElement.style.colorScheme = "";
});

describe("resolveTheme", () => {
  it("returns explicit preferences unchanged", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("follows the OS preference when set to system", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
  });
});

describe("isThemePreference", () => {
  it("accepts the three supported values only", () => {
    expect(isThemePreference("light")).toBe(true);
    expect(isThemePreference("dark")).toBe(true);
    expect(isThemePreference("system")).toBe(true);
    expect(isThemePreference("auto")).toBe(false);
    expect(isThemePreference(null)).toBe(false);
  });
});

describe("applyTheme", () => {
  it("toggles the dark class and native color scheme", () => {
    applyTheme("dark");

    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.style.colorScheme).toBe("dark");

    applyTheme("light");

    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(document.documentElement.style.colorScheme).toBe("light");
  });
});
