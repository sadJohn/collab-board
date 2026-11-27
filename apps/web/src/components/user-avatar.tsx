import { Avatar, AvatarFallback, AvatarImage, cn } from "@repo/ui";

/** Minimal user shape needed to render an avatar anywhere in the UI. */
export interface UserAvatarUser {
  id?: string | null;
  name?: string | null;
  email?: string | null;
  image?: string | null;
}

export type UserAvatarSize = "sm" | "md" | "lg";

const SIZE_CLASS: Record<UserAvatarSize, string> = {
  sm: "size-6 text-[10px]",
  md: "size-8 text-xs",
  lg: "size-10 text-sm",
};

/** Stable palette so the same user always gets the same fallback colour. */
const FALLBACK_COLORS = [
  "bg-rose-600",
  "bg-amber-600",
  "bg-emerald-600",
  "bg-sky-600",
  "bg-indigo-600",
  "bg-fuchsia-600",
] as const;

function displayName(user: UserAvatarUser): string {
  return user.name?.trim() || user.email?.trim() || "";
}

function initials(user: UserAvatarUser): string {
  const source = displayName(user);
  return source ? source.charAt(0).toUpperCase() : "?";
}

function fallbackColor(user: UserAvatarUser): string {
  const seed = user.id ?? user.email ?? user.name ?? "";
  let hash = 0;

  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) | 0;
  }

  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

interface UserAvatarProps {
  user: UserAvatarUser;
  size?: UserAvatarSize;
  className?: string;
}

/**
 * Single avatar component shared by the header, task cards, the task drawer
 * and the comment list. Falls back to a deterministic coloured initial when
 * the user has no image (or the image fails to load).
 */
export function UserAvatar({ user, size = "md", className }: UserAvatarProps) {
  const label = displayName(user);

  return (
    <Avatar className={cn(SIZE_CLASS[size], className)}>
      {user.image ? <AvatarImage alt={label} src={user.image} /> : null}
      <AvatarFallback className={cn("font-medium text-white", fallbackColor(user))}>
        {initials(user)}
      </AvatarFallback>
    </Avatar>
  );
}
