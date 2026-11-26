import { useTranslation } from "react-i18next";

import { isSupportedLanguage } from "../locales/i18n";
import { useUiStore } from "../stores/ui-store";

export function LanguageSwitcher() {
  const { t } = useTranslation();
  const language = useUiStore((state) => state.language);
  const setLanguage = useUiStore((state) => state.setLanguage);

  return (
    <select
      aria-label={t("language.label")}
      className="h-8 rounded-md border border-input bg-background px-2 text-xs shadow-xs outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      value={language}
      onChange={(event) => {
        const next = event.target.value;

        if (isSupportedLanguage(next)) {
          setLanguage(next);
        }
      }}
    >
      <option value="zh-CN">{t("language.zhCN")}</option>
      <option value="en-US">{t("language.enUS")}</option>
    </select>
  );
}
