// @vitest-environment node
/**
 * The bundled serif must cover every character the app can show in it, be
 * served from the bundle, and be applied by one rule that never fakes a weight.
 *
 * Coverage is read from the font binary itself rather than a committed list of
 * code points, so the check cannot drift from the asset it describes. It runs
 * in the node environment: it only reads files, and jsdom's typed-array realm
 * can break WOFF2 decoding.
 */

import fs from "node:fs";
import path from "node:path";
import * as fontkit from "fontkit";
import { describe, expect, it } from "vitest";
import { resources } from "../i18n";
import { SUPPORTED_LANGUAGES } from "../i18n/languages";
import { SRC, declarationsIn, read, relative, stripComments, stylesheets } from "../test/cssSources";

const FONT_FILE = path.join(SRC, "assets", "fonts", "UoqMunThenKhung-Regular.woff2");

/**
 * Literals components render in serif outside the locale files: digits for
 * ordinals and counts, signs for offsets, the breadcrumb slash, and the
 * separators of numbers and timecodes (U+2212 is the typographic minus).
 */
const SERIF_LITERALS = "0123456789+−/.,:";

interface Source {
  where: string;
  text: string;
}

/** Every string value in a locale namespace, with its `lang/namespace` origin. */
function stringsIn(value: unknown, where: string, out: Source[] = []): Source[] {
  if (typeof value === "string") out.push({ where, text: value });
  else if (value !== null && typeof value === "object") {
    for (const child of Object.values(value)) stringsIn(child, where, out);
  }
  return out;
}

function localeSources(): Source[] {
  return SUPPORTED_LANGUAGES.flatMap((language) =>
    Object.entries(resources[language]).flatMap(([namespace, strings]) =>
      stringsIn(strings, `${language}/${namespace}`),
    ),
  );
}

/**
 * `U+XXXX 'c' in <where>` for every character the font has no glyph for.
 * Interpolation placeholders (`{{count}}`) are replaced before rendering, so
 * their braces and names never reach the screen and are not checked.
 */
export function uncoveredCharacters(sources: Source[], covered: Set<number>): string[] {
  const offenders = new Set<string>();
  for (const { where, text } of sources) {
    for (const character of text.replace(/\{\{[^}]*\}\}/g, "")) {
      if (character === "\n" || character === "\t") continue;
      const codePoint = character.codePointAt(0)!;
      if (!covered.has(codePoint)) {
        const hex = codePoint.toString(16).toUpperCase().padStart(4, "0");
        offenders.add(`U+${hex} '${character}' in ${where}`);
      }
    }
  }
  return [...offenders];
}

describe("the bundled serif", () => {
  it(
    "has a glyph for every character of every locale string",
    () => {
      const font = fontkit.create(fs.readFileSync(FONT_FILE)) as fontkit.Font;
      const covered = new Set(font.characterSet);
      const sources = [...localeSources(), { where: "serif literals", text: SERIF_LITERALS }];

      expect(sources.length).toBeGreaterThan(100);
      expect(uncoveredCharacters(sources, covered)).toEqual([]);
      // The matcher can fail: the last code point Unicode has is in no font.
      expect(uncoveredCharacters([{ where: "probe", text: "a\u{10FFFF}" }], covered)).toEqual([
        "U+10FFFF '\u{10FFFF}' in probe",
      ]);
    },
    30_000,
  );

  it("is served from a file inside the source tree, and nothing loads from a remote host", () => {
    const fontFaces = stylesheets().flatMap((file) =>
      declarationsIn(read(file))
        .filter(({ selector, property }) => selector === "@font-face" && property === "src")
        .map(({ value }) => ({ file, value })),
    );

    expect(fontFaces).toHaveLength(1);
    const [{ file, value }] = fontFaces;
    const url = /url\("([^"]+)"\)/.exec(value)?.[1];
    expect(url).toBeDefined();
    const target = path.resolve(path.dirname(file), url!);
    expect(relative(target).startsWith("..")).toBe(false);
    expect(fs.existsSync(target)).toBe(true);

    const remote = stylesheets().flatMap((sheet) =>
      [...stripComments(read(sheet)).matchAll(/(?:url\([^)]*\)|@import[^;]*;)/g)]
        .map((match) => match[0])
        .filter((reference) => /https?:/i.test(reference))
        .map((reference) => `${relative(sheet)}: ${reference}`),
    );
    expect(remote).toEqual([]);

    const entry = read(path.resolve(SRC, "..", "index.html"));
    expect(entry).not.toMatch(/<link\b/i);
    expect(entry).not.toMatch(/https?:/i);
  });

  it("is applied by one shared rule at regular weight with synthesis off", () => {
    const users = stylesheets()
      .filter((file) => relative(file) !== path.join("styles", "tokens.css"))
      .flatMap((file) =>
        declarationsIn(read(file))
          .filter(({ value }) => value.includes("var(--font-serif)"))
          .map(({ selector }) => ({ file: relative(file), selector })),
      );

    expect(users).toEqual([{ file: path.join("styles", "global.css"), selector: "h1, h2, h3, .serif" }]);

    const rule = declarationsIn(read(path.join(SRC, "styles", "global.css"))).filter(
      ({ selector }) => selector === "h1, h2, h3, .serif",
    );
    expect(rule).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ property: "font-weight", value: "400" }),
        expect.objectContaining({ property: "font-style", value: "normal" }),
        expect.objectContaining({ property: "font-synthesis", value: "none" }),
      ]),
    );
  });
});
