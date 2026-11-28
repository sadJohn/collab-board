import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useUiStore } from "@/stores/ui-store";
import { authClient, useSession } from "./auth-client";
import { queryKeys } from "./query-keys";

export interface SwitchWorkspaceResult {
  ok: boolean;
  error?: string;
}

/**
 * Optimistically switch the active workspace.
 *
 * The selected workspace is rendered immediately (via the UI store's
 * `optimisticActiveOrganizationId`, which `useActiveWorkspace` prefers), so
 * the user sees the new workspace without waiting for the network. The
 * `setActive` commit and cache refresh happen in the background:
 *
 * - Success: the session is refetched; once it catches up, `useActiveWorkspace`
 *   clears the optimistic override and `isSwitching` flips false. Org-scoped
 *   queries key on the optimistic id (so a switch instantly shows the target
 *   workspace's cached data) but gate their fetch on `!isSwitching`, so the
 *   first real fetch always runs against the now-committed cookie. The target
 *   org's queries are then invalidated so they refresh immediately in the
 *   background (cached data stays on screen — no loading flash). Global
 *   caches (notifications, invitations) are invalidated too.
 * - Failure: the optimistic selection is reverted (the UI snaps back to the
 *   real active workspace) and an error is surfaced.
 *
 * A `latestTarget` ref guards against rapid successive switches: only the most
 * recently requested target can clear or revert the optimistic value, so a
 * stale response can never clobber a newer selection.
 *
 * Returns a promise so callers that need to navigate *after* the commit (e.g.
 * jumping into a different workspace's board) can await it; callers that only
 * need the instant visual update can fire-and-forget.
 */
export function useSwitchWorkspace() {
  const { t } = useTranslation();
  const session = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();
  const setOptimistic = useUiStore((state) => state.setOptimisticActiveOrganizationId);
  const setError = useUiStore((state) => state.setWorkspaceSwitchError);
  const refetchSession = session.refetch;

  const currentIdRef = useRef<string | null>(null);
  currentIdRef.current = session.data?.session.activeOrganizationId ?? null;
  const latestTarget = useRef<string | null>(null);

  const switchTo = useCallback(
    async (organizationId: string): Promise<SwitchWorkspaceResult> => {
      const currentId = currentIdRef.current;
      if (!organizationId || organizationId === currentId) {
        return { ok: true };
      }

      // Optimistic first: the whole app re-renders against the new workspace.
      latestTarget.current = organizationId;
      setOptimistic(organizationId);
      setError(null);

      try {
        const { error } = await authClient.organization.setActive({ organizationId });
        if (error) {
          throw new Error(error.message || t("workspace.switchFailed"));
        }

        // The active-org cookie is now committed server-side. Refresh the
        // session atom deterministically so useActiveWorkspace clears the
        // optimistic override and `isSwitching` flips false — that is what
        // un-gates org-scoped queries (keyed on the optimistic id).
        await refetchSession();

        // Force the target org's queries to refresh immediately in the
        // background. They key on the optimistic id so the cache is already on
        // screen; invalidating marks it stale so the now-un-gated queries
        // refetch against the committed cookie (staleTime no longer defers it),
        // while the cached data stays visible — no loading flash.
        queryClient.invalidateQueries({ queryKey: ["organizations", organizationId] });
        queryClient.invalidateQueries({ queryKey: queryKeys.notifications.list });
        queryClient.invalidateQueries({ queryKey: queryKeys.invitations.received });
        await router.invalidate();

        return { ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (latestTarget.current === organizationId) {
          setOptimistic(null);
          setError(message || t("workspace.switchFailed"));
        }
        return { ok: false, error: message || t("workspace.switchFailed") };
      }
    },
    [queryClient, refetchSession, router, setOptimistic, setError, t],
  );

  return { switchTo };
}
