import { useEffect } from "react";
import { useUiStore } from "../stores/ui-store";
import { useListOrganizations, useSession } from "./auth-client";

export interface ActiveWorkspace {
  id: string;
  name: string;
  slug: string;
}

/**
 * Active workspace derived from already-cached session + organization list —
 * this hook makes zero network calls of its own.
 *
 * Why not better-auth's `useActiveOrganization`? That hook fetches
 * `/organization/get-full-organization` (org + members + invitations + teams),
 * which this app never consumes — it only ever reads `.id` and `.name`. The
 * active id comes from the session cookie's `activeOrganizationId`; the
 * name/slug come from the organization list the user already has cached.
 *
 * Optimistic switching: while a switch is in flight, `optimisticActiveOrganizationId`
 * in the UI store overrides the session so the whole app renders the new
 * workspace instantly. Once the session refetches and catches up (setActive
 * auto-refetches the session), we hand control back to the session by clearing
 * the optimistic value.
 *
 * `data` is optimistic and is what both UI chrome (header selection, workspace
 * name, realtime) AND data queries key on. Keying queries on the optimistic id
 * is what lets a switch instantly show the target workspace's cached data
 * (cache-first). To keep that correct, every org-scoped query must ALSO gate
 * its fetch on `!isSwitching` — otherwise it would fire against the still-old
 * cookie mid-switch and cache the previous workspace's data under the new key.
 * Once the session catches up, `isSwitching` flips false and the query fetches
 * (or background-refreshes) against the now-committed cookie.
 */
export function useActiveWorkspace() {
  const optimisticId = useUiStore((state) => state.optimisticActiveOrganizationId);
  const setOptimistic = useUiStore((state) => state.setOptimisticActiveOrganizationId);
  const session = useSession();
  const organizations = useListOrganizations();

  const sessionId = session.data?.session.activeOrganizationId ?? null;
  const activeId = optimisticId ?? sessionId;
  const organization = activeId
    ? (organizations.data?.find((item) => item.id === activeId) ?? null)
    : null;

  // The session is the source of truth. Once it catches up to the optimistic
  // selection, clear the override so a stale store value can never win later.
  useEffect(() => {
    if (optimisticId && sessionId === optimisticId) {
      setOptimistic(null);
    }
  }, [optimisticId, sessionId, setOptimistic]);

  // Keep the id even if the list is momentarily stale (e.g. right after
  // accepting an invitation), so per-org queries still run with the right scope.
  const data: ActiveWorkspace | null = activeId
    ? {
        id: activeId,
        name: organization?.name ?? "",
        slug: organization?.slug ?? "",
      }
    : null;

  return {
    data,
    isPending: session.isPending || organizations.isPending,
    // A switch is in flight while the optimistic selection hasn't been confirmed
    // by the session yet. Queries gate their fetch on `!isSwitching`.
    isSwitching: Boolean(optimisticId) && optimisticId !== sessionId,
  };
}
