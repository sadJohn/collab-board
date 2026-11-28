import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  applyTheme,
  DEFAULT_THEME,
  prefersDark,
  resolveTheme,
  type ThemePreference,
} from "@/lib/theme";
import { tracker } from "@/lib/tracker";
import i18n, {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  type SupportedLanguage,
} from "@/locales/i18n";

interface UiState {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
  /** Light / dark / follow the OS; persisted so it survives reloads. */
  theme: ThemePreference;
  setTheme: (theme: ThemePreference) => void;
  /** Desktop sidebar collapse state, persisted so it survives reloads. */
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleSidebar: () => void;
  /** Task detail drawer; `null` means the drawer is closed. */
  activeTaskId: string | null;
  setActiveTaskId: (taskId: string | null) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  toggleCommandPalette: () => void;
  /** Mobile nav drawer; transient — closed on every reload. */
  mobileNavOpen: boolean;
  setMobileNavOpen: (open: boolean) => void;
  /**
   * Optimistically selected workspace id while a switch is in flight. When set,
   * `useActiveWorkspace` prefers this over the session so the UI renders the new
   * workspace instantly; it is cleared once the session catches up (success) or
   * reverted on failure. Transient — never persisted.
   */
  optimisticActiveOrganizationId: string | null;
  setOptimisticActiveOrganizationId: (organizationId: string | null) => void;
}

function resolveInitialLanguage(): SupportedLanguage {
  return isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
}

/**
 * Client-only UI state. Server data never lives here — TanStack Query owns it.
 *
 * The language and the sidebar preference are persisted to localStorage. The
 * drawer and command palette are transient session state, so they are excluded
 * from `partialize`.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      language: resolveInitialLanguage(),
      setLanguage: (language) => {
        set({ language });
        void i18n.changeLanguage(language);
      },
      theme: DEFAULT_THEME,
      setTheme: (theme) => {
        set({ theme });
        applyTheme(resolveTheme(theme, prefersDark()));
      },
      sidebarCollapsed: false,
      setSidebarCollapsed: (sidebarCollapsed) => {
        set({ sidebarCollapsed });
      },
      toggleSidebar: () => {
        set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed }));
      },
      activeTaskId: null,
      setActiveTaskId: (activeTaskId) => {
        set({ activeTaskId });
      },
      commandPaletteOpen: false,
      setCommandPaletteOpen: (commandPaletteOpen) => {
        set((state) => {
          if (commandPaletteOpen && !state.commandPaletteOpen) {
            tracker.track("COMMAND_PALETTE_OPENED");
          }
          return { commandPaletteOpen };
        });
      },
      toggleCommandPalette: () => {
        set((state) => {
          const next = !state.commandPaletteOpen;
          if (next) {
            tracker.track("COMMAND_PALETTE_OPENED");
          }
          return { commandPaletteOpen: next };
        });
      },
      mobileNavOpen: false,
      setMobileNavOpen: (mobileNavOpen) => {
        set({ mobileNavOpen });
      },
      optimisticActiveOrganizationId: null,
      setOptimisticActiveOrganizationId: (optimisticActiveOrganizationId) => {
        set({ optimisticActiveOrganizationId });
      },
    }),
    {
      name: "collab-board.ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        language: state.language,
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) {
          return;
        }

        void i18n.changeLanguage(state.language);
        applyTheme(resolveTheme(state.theme, prefersDark()));
      },
    },
  ),
);

i18n.on("languageChanged", (language) => {
  if (!isSupportedLanguage(language)) {
    return;
  }

  if (useUiStore.getState().language !== language) {
    useUiStore.setState({ language });
  }
});
