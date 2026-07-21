/**
 * Supported languages and first-launch locale detection.
 *
 * Like the theme preference, the language is GUI-only state kept in
 * `localStorage`, never in the shared CLI configuration file.
 */

export const SUPPORTED_LANGUAGES = ["en", "zh-TW"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = "subx.language";

export const DEFAULT_LANGUAGE: SupportedLanguage = "en";

/** Locales served by the Traditional Chinese bundle. */
const TRADITIONAL_CHINESE_TAGS = ["zh-tw", "zh-hant", "zh-hk", "zh-mo"];

function isSupported(value: unknown): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(value as SupportedLanguage);
}

/**
 * Maps a BCP 47 locale to a supported language.
 *
 * Traditional Chinese locales (`zh-TW`, `zh-Hant`, `zh-Hant-HK`, `zh-HK`, …)
 * resolve to `zh-TW`; everything else — including Simplified Chinese — falls
 * back to English.
 */
export function matchLanguage(locale: string): SupportedLanguage | null {
  const normalized = locale.toLowerCase();
  const isTraditionalChinese = TRADITIONAL_CHINESE_TAGS.some(
    (tag) => normalized === tag || normalized.startsWith(`${tag}-`),
  );
  return isTraditionalChinese ? "zh-TW" : null;
}

/** Picks the first supported language among the candidate locales. */
export function detectLanguage(candidates: readonly string[]): SupportedLanguage {
  for (const candidate of candidates) {
    const matched = matchLanguage(candidate);
    if (matched) {
      return matched;
    }
  }
  return DEFAULT_LANGUAGE;
}

export function readStoredLanguage(): SupportedLanguage | null {
  try {
    const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isSupported(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function writeStoredLanguage(language: SupportedLanguage): void {
  try {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Persistence is best-effort; the in-memory language still applies.
  }
}

/**
 * Resolves the language for this launch: a persisted choice wins, otherwise the
 * system locales decide.
 */
export function resolveInitialLanguage(
  systemLocales: readonly string[] = navigator.languages ?? [navigator.language],
): SupportedLanguage {
  return readStoredLanguage() ?? detectLanguage(systemLocales);
}
