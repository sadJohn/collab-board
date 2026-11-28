import { useLocation } from "@tanstack/react-router";
import { useEffect } from "react";

import { tracker } from "@/lib/tracker";

/**
 * Emits a `PAGE_VIEW` for the current path on mount and on every subsequent
 * route change. Mounted once in the authenticated `AppLayout`, so navigation
 * across the product surface (dashboard, projects, workspace, analytics) is
 * captured without recording pre-login pages.
 */
export function usePageViewTracking(): void {
  const location = useLocation();

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run on every pathname change so each navigation is recorded
  useEffect(() => {
    tracker.track("PAGE_VIEW");
  }, [location.pathname]);
}
