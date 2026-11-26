import "i18next";

import type zh from "./zh.json";

/**
 * Derives the translation key union from `zh.json`, so `t("...")` rejects any
 * key that does not exist in the translation resources at compile time.
 */
declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "translation";
    resources: {
      translation: typeof zh;
    };
  }
}
