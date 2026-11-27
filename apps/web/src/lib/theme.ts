export type ThemePreference = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

/** Persisted key shared with `useUiStore` and the inline FOUC guard. */
export const THEME_STORAGE_KEY = "collab-board.ui";

export const DEFAULT_THEME: ThemePreference = "system";

const DARK_QUERY = "(prefers-color-scheme: dark)";

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/** Reads the OS preference, tolerating test environments without matchMedia. */
export function prefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }

  return window.matchMedia(DARK_QUERY).matches;
}

export function resolveTheme(preference: ThemePreference, prefersDarkMode: boolean): ResolvedTheme {
  if (preference === "system") {
    return prefersDarkMode ? "dark" : "light";
  }

  return preference;
}

/** Applies the resolved theme to `<html>` so every semantic token follows. */
export function applyTheme(theme: ResolvedTheme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  // Keeps native form controls, scrollbars and the browser UI in sync.
  root.style.colorScheme = theme;
}

/**
 * Subscribes to OS theme changes. The callback receives the new preference;
 * callers decide whether `system` mode should react (explicit light/dark must
 * not be overridden by an OS change).
 */
export function watchSystemTheme(onChange: (prefersDarkMode: boolean) => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => undefined;
  }

  const media = window.matchMedia(DARK_QUERY);
  const listener = (event: MediaQueryListEvent) => onChange(event.matches);

  media.addEventListener("change", listener);
  return () => media.removeEventListener("change", listener);
}
