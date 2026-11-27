import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/ui";
import { Check, Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SupportedLanguage } from "../locales/i18n";
import { useUiStore } from "../stores/ui-store";

const OPTIONS = [
  { value: "zh-CN", labelKey: "language.zhCN" },
  { value: "en-US", labelKey: "language.enUS" },
] as const satisfies readonly {
  value: SupportedLanguage;
  labelKey: "language.zhCN" | "language.enUS";
}[];

/** Icon dropdown that switches between the supported UI languages. */
export function LanguageSwitcher() {
  const { t } = useTranslation();
  const language = useUiStore((state) => state.language);
  const setLanguage = useUiStore((state) => state.setLanguage);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={t("language.label")}
          size="icon"
          title={t("language.label")}
          type="button"
          variant="ghost"
        >
          <Languages />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-40">
        <DropdownMenuLabel>{t("language.label")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => {
              setLanguage(option.value);
            }}
          >
            <span className="flex-1">{t(option.labelKey)}</span>
            {language === option.value ? <Check className="ml-auto size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
