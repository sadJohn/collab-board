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
}

function resolveInitialLanguage(): SupportedLanguage {
  return isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
}

/**
 * Client-only UI state. Server data never lives here — TanStack Query owns it.
 *
 * The language is persisted to localStorage and kept in sync with i18next in
 * both directions: `setLanguage` drives i18next, and language changes coming
 * from elsewhere (detector, tests, future features) are mirrored back.
 */
export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      language: resolveInitialLanguage(),
      setLanguage: (language) => {
        set({ language });
        void i18n.changeLanguage(language);
      },
    }),
    {
      name: "collab-board.ui",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ language: state.language }),
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
