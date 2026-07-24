import { describe, expect, it } from "vitest";
import {
  LANGUAGE_STORAGE_KEY,
  detectLanguage,
  readStoredLanguage,
  resolveInitialLanguage,
  writeStoredLanguage,
} from "./languages";

describe("locale detection", () => {
  it.each(["zh-TW", "zh-Hant", "zh-Hant-HK", "zh-HK", "zh-MO"])(
    "maps the Traditional Chinese locale %s to zh-TW",
    (locale) => {
      expect(detectLanguage([locale])).toBe("zh-TW");
    },
  );

  // @covers localization/system-locale-detection-on-first-launch#any-other-system-locale
  it.each(["ja-JP", "en-US", "de", "zh-CN", "zh-Hans"])(
    "falls back to English for %s",
    (locale) => {
      expect(detectLanguage([locale])).toBe("en");
    },
  );

  it("picks the first supported locale from the candidate list", () => {
    expect(detectLanguage(["ja-JP", "zh-TW", "en-US"])).toBe("zh-TW");
  });

  it("defaults to English when no locales are offered", () => {
    expect(detectLanguage([])).toBe("en");
  });
});

describe("language persistence", () => {
  it("round-trips a stored language", () => {
    writeStoredLanguage("zh-TW");
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh-TW");
    expect(readStoredLanguage()).toBe("zh-TW");
  });

  it("ignores an unsupported stored value", () => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, "fr");
    expect(readStoredLanguage()).toBeNull();
  });

  it("prefers the stored language over the system locale", () => {
    writeStoredLanguage("en");
    expect(resolveInitialLanguage(["zh-TW"])).toBe("en");
  });

  // @covers localization/system-locale-detection-on-first-launch#traditional-chinese-system
  it("detects from the system locale on first launch", () => {
    expect(resolveInitialLanguage(["zh-TW"])).toBe("zh-TW");
  });
});
