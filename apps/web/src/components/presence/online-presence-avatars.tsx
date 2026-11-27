import type { PresenceUser } from "@repo/shared";
import { Tooltip, TooltipContent, TooltipTrigger } from "@repo/ui";
import { useTranslation } from "react-i18next";

import { UserAvatar } from "../user-avatar";

/** Render at most this many avatars inline; anything beyond collapses to +N. */
const MAX_VISIBLE = 5;

export interface OnlinePresenceAvatarsProps {
  users: PresenceUser[];
  currentUserId?: string;
}

/**
 * Shows which team members are currently viewing the project in real time.
 *
 * Design notes:
 *   - Collapses to a subtle dot when nobody is in the room yet — we never lie
 *     about presence by showing a loading skeleton.
 *   - Each avatar gets its own Tooltip ("Alice — Online", or "You — Online"
 *     for the local user). A trailing `+N` badge for everyone past 5.
 *   - Pure display — all state comes from the parent hook; we don't touch
 *     Zustand / React Query anywhere.
 */
export function OnlinePresenceAvatars({ users, currentUserId }: OnlinePresenceAvatarsProps) {
  const { t } = useTranslation();

  if (users.length === 0) {
    // Empty state: a small dot so the region stays visible during cold start.
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="size-2 rounded-full bg-emerald-500/70" />
      </span>
    );
  }

  const visible = users.slice(0, MAX_VISIBLE);
  const extraCount = users.length - visible.length;

  return (
    <fieldset
      className="flex items-center -space-x-2 border-0 p-0"
      aria-label={t("presence.count", { count: users.length })}
    >
      {visible.map((user) => {
        const isMe = currentUserId === user.id;
        const label = isMe
          ? `${user.name} — ${t("presence.you")}, ${t("presence.online")}`
          : `${user.name} — ${t("presence.online")}`;

        return (
          <Tooltip key={user.id}>
            <TooltipTrigger asChild>
              <span className="inline-block rounded-full ring-2 ring-background">
                <UserAvatar user={user} size="sm" />
              </span>
            </TooltipTrigger>
            <TooltipContent className="font-medium" side="bottom">
              {label}
            </TooltipContent>
          </Tooltip>
        );
      })}

      {extraCount > 0 ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-muted text-[10px] font-medium text-muted-foreground ring-2 ring-background">
              {t("presence.andMore", { count: extraCount })}
            </span>
          </TooltipTrigger>
          <TooltipContent className="font-medium" side="bottom">
            {t("presence.count", { count: users.length })}
          </TooltipContent>
        </Tooltip>
      ) : null}
    </fieldset>
  );
}
