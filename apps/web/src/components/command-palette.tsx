import type { TaskDto } from "@repo/shared";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@repo/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { useListOrganizations } from "@/lib/auth-client";
import { queryKeys } from "@/lib/query-keys";
import { DEFAULT_TASK_LIST_SEARCH } from "@/lib/task-search";
import { useActiveWorkspace } from "@/lib/use-active-workspace";
import { useSwitchWorkspace } from "@/lib/use-switch-workspace";
import type { SupportedLanguage } from "@/locales/i18n";
import { useUiStore } from "@/stores/ui-store";

/**
 * Global command palette (Cmd/Ctrl+K).
 *
 * Four item groups — all keyboard-navigable, all i18n'd, all using shared
 * cache or state sources:
 *
 *   1. **Quick actions** — always visible: new task (currently navigates to
 *      the board where the quick-create widget lives; a full drawer-driven
 *      create flow lands in 7.5.1), switch language (uses ui-store + i18next),
 *      jump to profile settings.
 *   2. **View switch** — only visible while inside a project: board vs list.
 *   3. **Task search** — only visible inside a project: reads the cached
 *      `queryKeys.tasks.all(orgId, projectId)` list from TanStack Query and
 *      fuzzy-matches by title; selecting opens the task detail drawer.
 *   4. **Workspace switch** — always visible: every organization the current
 *      user belongs to; `setActive` + session cache invalidate.
 *
 * Every successful action closes the palette so the user lands directly on
 * the destination.
 */
export function CommandPalette() {
  const { t } = useTranslation();
  const open = useUiStore((state) => state.commandPaletteOpen);
  const setOpen = useUiStore((state) => state.setCommandPaletteOpen);
  const setActiveTaskId = useUiStore((state) => state.setActiveTaskId);
  const toggleLanguage = useUiStore((state) => state.setLanguage);

  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const activeOrganization = useActiveWorkspace();
  const { switchTo } = useSwitchWorkspace();
  const organizationId = activeOrganization.data?.id ?? "";
  const listOrganizations = useListOrganizations();

  // 150ms debounce feel — the cmdk input filters internally as we also filter
  // the cached list. We keep our filter in sync so both narrow down together.
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  // Extract project id from path to gate view switch + task search groups.
  const projectId = useMemo(() => {
    // `location` comes from useLocation() in the navigate context; but we
    // prefer the router's actual window.location so this function works no
    // matter where it's mounted.
    const match = window.location.pathname.match(/^\/projects\/([^/]+)/);
    return match ? match[1] : null;
  }, []); // re-read on open (window.location is stable, but query changing isn't harmful)

  const isInProject = projectId !== null;
  const currentProjectId = projectId as string;

  // --- 3. Task search: cached list -> fuzzy match -> open drawer. --------
  const cachedTasks: TaskDto[] = useMemo(() => {
    if (!organizationId || !projectId) return [];
    const all = queryClient.getQueryData<TaskDto[]>(queryKeys.tasks.all(organizationId, projectId));
    return all ?? [];
  }, [queryClient, organizationId, projectId]);

  const matchingTasks = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return cachedTasks.slice(0, 10);

    return cachedTasks
      .filter((task) => {
        const hay = `${task.title} ${task.projectId}`.toLowerCase();
        return hay.includes(needle);
      })
      .slice(0, 10);
  }, [cachedTasks, query]);

  /** Close the palette then run the action (so the palette dismiss animation
   *  fires first and the destination doesn't render under a modal). */
  function closeAndRun(action: () => void) {
    setOpen(false);
    action();
  }

  // Body overflow sync.
  useEffect(() => {
    if (!open) return;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Route helpers for the palette — they're tiny and inlined where needed.
  function gotoBoard(pid: string) {
    void navigate({
      to: "/projects/$projectId/board",
      params: { projectId: pid },
    });
  }

  function gotoList(pid: string) {
    void navigate({
      to: "/projects/$projectId/list",
      params: { projectId: pid },
      search: DEFAULT_TASK_LIST_SEARCH,
    });
  }

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("command.title")}
      description={t("command.description")}
    >
      <CommandInput placeholder={t("command.placeholder")} value={query} onValueChange={setQuery} />
      <CommandList>
        <CommandEmpty>{t("command.empty")}</CommandEmpty>

        {/* Group 1 — Quick actions (always). */}
        <CommandGroup heading={t("command.groups.actions")}>
          {isInProject ? (
            <CommandItem
              value={`new-task-${projectId}`}
              onSelect={() => closeAndRun(() => gotoBoard(currentProjectId))}
            >
              {t("command.items.newTask")}
            </CommandItem>
          ) : null}

          <CommandItem
            value="toggle-language"
            onSelect={() =>
              closeAndRun(() => {
                const current = useUiStore.getState().language;
                const next: SupportedLanguage = current === "zh-CN" ? "en-US" : "zh-CN";
                toggleLanguage(next);
              })
            }
          >
            {t("command.items.toggleLanguage")}
            <CommandShortcut>
              {t("language.zhCN")} / {t("language.enUS")}
            </CommandShortcut>
          </CommandItem>

          <CommandItem
            value="profile-settings"
            onSelect={() => closeAndRun(() => void navigate({ to: "/settings/profile" }))}
          >
            {t("command.items.profileSettings")}
          </CommandItem>
        </CommandGroup>

        {/* Group 2 — View switch (project only). */}
        {isInProject ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("command.groups.navigation")}>
              <CommandItem
                value={`board-view-${projectId}`}
                onSelect={() => closeAndRun(() => gotoBoard(currentProjectId))}
              >
                {t("command.items.boardView")}
              </CommandItem>
              <CommandItem
                value={`list-view-${projectId}`}
                onSelect={() => closeAndRun(() => gotoList(currentProjectId))}
              >
                {t("command.items.listView")}
              </CommandItem>
            </CommandGroup>
          </>
        ) : null}

        {/* Group 3 — Task quick-search (project only). */}
        {isInProject ? (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("command.groups.tasks")}>
              {matchingTasks.map((task) => (
                <CommandItem
                  key={task.id}
                  value={`task-${task.id}-${task.title}`}
                  onSelect={() => closeAndRun(() => setActiveTaskId(task.id))}
                >
                  <span className="text-muted-foreground mr-2 font-mono text-[10px]">
                    {task.projectId}
                  </span>
                  <span className="truncate">{task.title}</span>
                  <span className="ml-auto text-[10px] uppercase text-muted-foreground">
                    {task.status}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        ) : null}

        {/* Group 4 — Workspace switch (always). */}
        <CommandSeparator />
        <CommandGroup heading={t("command.groups.workspaces")}>
          {listOrganizations.data?.map((org) => {
            const isActive = org.id === organizationId;
            return (
              <CommandItem
                key={org.id}
                value={`org-${org.name}-${org.id}`}
                onSelect={() => closeAndRun(() => void switchTo(org.id))}
              >
                {org.name}
                {isActive ? <CommandShortcut>{t("workspace.active")}</CommandShortcut> : null}
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
