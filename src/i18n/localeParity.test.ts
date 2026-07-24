import { describe, expect, it } from "vitest";
import { SUPPORTED_LANGUAGES } from "./languages";
import { resources } from "./index";

type Json = { [key: string]: string | Json };

function flattenKeys(value: Json, prefix = ""): string[] {
  return Object.entries(value).flatMap(([key, entry]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof entry === "string" ? [path] : flattenKeys(entry, path);
  });
}

const NAMESPACES = Object.keys(resources.en) as (keyof typeof resources.en)[];

describe("locale parity", () => {
  // @covers localization/ui-is-localized-in-english-and-traditional-chinese#complete-zh-tw-coverage
  it.each(NAMESPACES)("every language defines the same keys in the %s namespace", (namespace) => {
    const reference = flattenKeys(resources.en[namespace] as Json).sort();

    for (const language of SUPPORTED_LANGUAGES) {
      const keys = flattenKeys(resources[language][namespace] as Json).sort();
      expect(keys, `${language}/${namespace}`).toEqual(reference);
    }
  });

  it("leaves no empty translations", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      for (const namespace of NAMESPACES) {
        const bundle = resources[language][namespace] as Json;
        const walk = (value: Json) => {
          for (const [key, entry] of Object.entries(value)) {
            if (typeof entry === "string") {
              expect(entry.trim(), `${language}/${namespace}:${key}`).not.toBe("");
            } else {
              walk(entry);
            }
          }
        };
        walk(bundle);
      }
    }
  });
});
