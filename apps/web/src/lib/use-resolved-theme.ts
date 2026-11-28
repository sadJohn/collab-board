import { useEffect, useState } from "react";
import { prefersDark, type ResolvedTheme, resolveTheme, watchSystemTheme } from "@/lib/theme";
import { useUiStore } from "@/stores/ui-store";

/**
 * The user's theme *preference* (light / dark / system) lives in the UI store,
 * but components that drive a third-party widget's `theme` prop need the
 * *resolved* value (light or dark) and must re-render when the OS flips while
 * the preference is "system". This hook resolves both and stays in sync.
 */
export function useResolvedTheme(): ResolvedTheme {
  const themePreference = useUiStore((state) => state.theme);
  const [prefersDarkMode, setPrefersDarkMode] = useState<boolean>(() => prefersDark());

  useEffect(() => watchSystemTheme(setPrefersDarkMode), []);

  return resolveTheme(themePreference, prefersDarkMode);
}
