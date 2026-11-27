import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import i18n, {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  type SupportedLanguage,
} from "../locales/i18n";

interface UiState {
  language: SupportedLanguage;
  setLanguage: (language: SupportedLanguage) => void;
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
        set({ commandPaletteOpen });
      },
      toggleCommandPalette: () => {
        set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen }));
      },
    }),
    {
      name: "collab-board.ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        language: state.language,
        sidebarCollapsed: state.sidebarCollapsed,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          void i18n.changeLanguage(state.language);
        }
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
