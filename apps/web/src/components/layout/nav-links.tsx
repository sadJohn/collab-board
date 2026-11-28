import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";

/**
 * Single source of truth for the primary navigation items. Shared by the
 * desktop sidebar (`routes/_app.tsx`) and the mobile drawer
 * (`components/layout/mobile-nav.tsx`), so adding or renaming a section only
 * needs one edit instead of two.
 */
export const NAV_ITEMS = [
  { to: "/home", labelKey: "nav.home" },
  { to: "/projects", labelKey: "nav.projects" },
  { to: "/workspace", labelKey: "nav.workspace" },
  { to: "/analytics", labelKey: "nav.analytics" },
] as const;

const linkClassName =
  "rounded-md px-3 py-2 text-muted-foreground hover:bg-accent hover:text-foreground";
const activeClassName = "rounded-md bg-accent px-3 py-2 font-medium text-foreground";

/**
 * Renders the primary nav links. The mobile drawer passes `onNavigate` to
 * close itself after a click; the desktop sidebar omits it.
 */
export function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const { t } = useTranslation();
  return (
    <nav className="flex flex-col gap-1 text-sm">
      {NAV_ITEMS.map((item) => (
        <Link
          key={item.to}
          to={item.to}
          className={linkClassName}
          activeProps={{ className: activeClassName }}
          onClick={onNavigate}
        >
          {t(item.labelKey)}
        </Link>
      ))}
    </nav>
  );
}
