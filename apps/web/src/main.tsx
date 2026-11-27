import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./locales/i18n";
import "./index.css";
import { applyTheme, prefersDark, resolveTheme, watchSystemTheme } from "./lib/theme";
import { router } from "./router";
import { useUiStore } from "./stores/ui-store";

function syncTheme(): void {
  const { theme } = useUiStore.getState();
  applyTheme(resolveTheme(theme, prefersDark()));
}

// The inline script in index.html already picked the first-paint theme; this
// keeps the store, DOM and OS media query in sync afterwards.
syncTheme();
watchSystemTheme(() => {
  if (useUiStore.getState().theme === "system") {
    syncTheme();
  }
});

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root element #root was not found in index.html");
}

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
