import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { ThemePreference } from "@/lib/theme";
import { useUiStore } from "@/stores/ui-store";

const OPTIONS = [
  { value: "light", icon: Sun, labelKey: "theme.light" },
  { value: "dark", icon: Moon, labelKey: "theme.dark" },
  { value: "system", icon: Monitor, labelKey: "theme.system" },
] as const satisfies readonly {
  value: ThemePreference;
  icon: typeof Sun;
  labelKey: "theme.light" | "theme.dark" | "theme.system";
}[];

const TRIGGER_ICON: Record<ThemePreference, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

interface ThemeToggleProps {
  className?: string;
}

/**
 * Light / dark / system switcher. Reads and writes the persisted preference in
 * `useUiStore`; DOM application lives in `lib/theme.ts`.
 */
export function ThemeToggle({ className }: ThemeToggleProps = {}) {
  const { t } = useTranslation();
  const theme = useUiStore((state) => state.theme);
  const setTheme = useUiStore((state) => state.setTheme);
  const TriggerIcon = TRIGGER_ICON[theme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("theme.label")}
          className={className}
          size="icon"
          title={t("theme.label")}
          type="button"
          variant="ghost"
        >
          <TriggerIcon />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{t("theme.label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((option) => {
          const Icon = option.icon;

          return (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => {
                setTheme(option.value);
              }}
            >
              <Icon />
              <span className="flex-1">{t(option.labelKey)}</span>
              {theme === option.value ? <Check className="ml-auto size-4" /> : null}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
