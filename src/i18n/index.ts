import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enCommon from "../locales/en/common.json";
import enConvert from "../locales/en/convert.json";
import enErrors from "../locales/en/errors.json";
import enHome from "../locales/en/home.json";
import enMatch from "../locales/en/match.json";
import enSettings from "../locales/en/settings.json";
import enSync from "../locales/en/sync.json";
import enWizard from "../locales/en/wizard.json";
import zhTWCommon from "../locales/zh-TW/common.json";
import zhTWConvert from "../locales/zh-TW/convert.json";
import zhTWErrors from "../locales/zh-TW/errors.json";
import zhTWHome from "../locales/zh-TW/home.json";
import zhTWMatch from "../locales/zh-TW/match.json";
import zhTWSettings from "../locales/zh-TW/settings.json";
import zhTWSync from "../locales/zh-TW/sync.json";
import zhTWWizard from "../locales/zh-TW/wizard.json";

import { DEFAULT_LANGUAGE, resolveInitialLanguage, writeStoredLanguage } from "./languages";
import type { SupportedLanguage } from "./languages";

/**
 * Locale resources, split by feature namespace so later changes add their own
 * namespace instead of growing one file.
 */
export const resources = {
  en: {
    common: enCommon,
    convert: enConvert,
    errors: enErrors,
    home: enHome,
    match: enMatch,
    settings: enSettings,
    sync: enSync,
    wizard: enWizard,
  },
  "zh-TW": {
    common: zhTWCommon,
    convert: zhTWConvert,
    errors: zhTWErrors,
    home: zhTWHome,
    match: zhTWMatch,
    settings: zhTWSettings,
    sync: zhTWSync,
    wizard: zhTWWizard,
  },
} as const;

export function initI18n(language: SupportedLanguage = resolveInitialLanguage()) {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources,
      lng: language,
      fallbackLng: DEFAULT_LANGUAGE,
      defaultNS: "common",
      ns: ["common", "convert", "errors", "home", "match", "settings", "sync", "wizard"],
      interpolation: { escapeValue: false },
    });
  }
  return i18n;
}

/** Switches the language at runtime and persists the choice. */
export async function changeLanguage(language: SupportedLanguage): Promise<void> {
  writeStoredLanguage(language);
  await i18n.changeLanguage(language);
}

export default i18n;
