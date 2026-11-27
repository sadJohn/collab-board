import { LanguageSwitcher } from "./language-switcher";
import { ThemeToggle } from "./theme-toggle";

/**
 * Theme + language controls for pages outside the app shell (welcome page and
 * the auth routes), which do not render `AppHeader`.
 */
export function PublicPageControls() {
  return (
    <div className="fixed top-4 right-4 z-10 flex items-center gap-2">
      <LanguageSwitcher />
      <ThemeToggle />
    </div>
  );
}
