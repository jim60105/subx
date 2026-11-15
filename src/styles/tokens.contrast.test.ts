/**
 * WCAG AA contrast over the theme tokens.
 *
 * `theme-system` requires every text colour to stay readable against the
 * surfaces it is rendered on, in both themes. Nothing else in the suite checks
 * that, and it is not something review catches reliably — so this reads
 * `tokens.css` itself and computes the ratios.
 *
 * The proof is exact only while every colour is opaque (nothing composites), so
 * one test below pins that, and it is only a proof at all because
 * `tokens.colorLiteral.test.ts` separately forbids colours declared anywhere
 * else.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Comments are stripped first: several of them contain `;` and `:`, which would
// otherwise be read as declaration boundaries and silently drop the token that
// follows.
const TOKENS_CSS = fs
  .readFileSync(path.resolve(__dirname, "tokens.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "");

/** WCAG AA for body text. */
const AA_NORMAL = 4.5;
/** WCAG AA for non-text marks (rules, markers, underlines) and large numerals. */
const AA_NON_TEXT = 3;

type Rgb = { r: number; g: number; b: number };

// --- CSS parsing -----------------------------------------------------------

/** Declarations of one top-level rule, keyed by custom-property name. */
function declarationsOf(selector: string): Map<string, string> {
  const start = TOKENS_CSS.indexOf(`${selector} {`);
  if (start === -1) throw new Error(`No "${selector}" block in tokens.css`);

  let depth = 0;
  let end = start;
  for (let i = TOKENS_CSS.indexOf("{", start); i < TOKENS_CSS.length; i += 1) {
    if (TOKENS_CSS[i] === "{") depth += 1;
    if (TOKENS_CSS[i] === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  const body = TOKENS_CSS.slice(TOKENS_CSS.indexOf("{", start) + 1, end);
  const declarations = new Map<string, string>();
  for (const raw of body.split(";")) {
    const colon = raw.indexOf(":");
    if (colon === -1) continue;
    const name = raw.slice(0, colon).trim();
    if (!name.startsWith("--")) continue;
    declarations.set(name, raw.slice(colon + 1).trim().replace(/\s+/g, " "));
  }
  return declarations;
}

const THEMES = ["dark", "light"] as const;

/** The colour tokens one theme block declares (`color-scheme` is not a token). */
function themeBlock(theme: (typeof THEMES)[number]): Map<string, string> {
  return declarationsOf(`:root[data-theme="${theme}"]`);
}

/** The tokens in effect for a theme: the shared `:root` block plus its override. */
function themeTokens(theme: (typeof THEMES)[number]): Map<string, string> {
  return new Map([...declarationsOf(":root"), ...themeBlock(theme)]);
}

/** Substitute `var(--x)` until no references remain. */
function resolve(value: string, tokens: Map<string, string>): string {
  let current = value;
  for (let pass = 0; pass < 10 && current.includes("var("); pass += 1) {
    current = current.replace(/var\(\s*(--[\w-]+)\s*\)/g, (_, name: string) => {
      const replacement = tokens.get(name);
      if (replacement === undefined) throw new Error(`Undefined token ${name}`);
      return replacement;
    });
  }
  if (current.includes("var(")) throw new Error(`Cyclic token reference in "${value}"`);
  return current;
}

// --- Colour ----------------------------------------------------------------

const OPAQUE_HEX = /^#[0-9a-f]{6}$/i;

function parseHex(value: string): Rgb {
  const text = value.trim();
  if (!OPAQUE_HEX.test(text)) throw new Error(`Not an opaque 6-digit hex colour: "${value}"`);
  return {
    r: parseInt(text.slice(1, 3), 16),
    g: parseInt(text.slice(3, 5), 16),
    b: parseInt(text.slice(5, 7), 16),
  };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

// --- The checks ------------------------------------------------------------

const TEXT_TOKENS = ["--ink", "--ink-2", "--ink-3", "--accent-ink", "--add", "--del"];
const SURFACES = ["--paper", "--paper-2"];

/**
 * Every foreground paired with the backgrounds it is rendered on. Text sits on
 * the window (`--paper`) or a hover/selected row (`--paper-2`); the only fills
 * are ink (primary button) and del (window close hover).
 */
const CHECKS: Array<{ foreground: string; background: string; where: string; minimum: number }> = [
  ...TEXT_TOKENS.flatMap((foreground) =>
    SURFACES.map((background) => ({
      foreground,
      background,
      where: "text on the window or a hover/selected row",
      minimum: AA_NORMAL,
    })),
  ),
  { foreground: "--on-ink", background: "--ink", where: "primary button label", minimum: AA_NORMAL },
  {
    foreground: "--on-ink",
    background: "--del",
    where: "window close button on hover",
    minimum: AA_NORMAL,
  },
  {
    foreground: "--accent",
    background: "--paper",
    where: "markers, active underline, focus ring",
    minimum: AA_NON_TEXT,
  },
];

describe.each(THEMES)("%s theme", (theme) => {
  const tokens = themeTokens(theme);

  // @covers theme-system/dual-light-dark-themes-with-neon-gradient-identity#both-themes-render-every-shell-screen
  it.each(CHECKS)(
    "$foreground on $background meets $minimum:1 ($where)",
    ({ foreground, background, minimum }) => {
      const ratio = contrastRatio(
        parseHex(resolve(`var(${foreground})`, tokens)),
        parseHex(resolve(`var(${background})`, tokens)),
      );
      expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(minimum);
    },
  );
});

describe("the token set", () => {
  it("declares every theme colour as an opaque hex, with the same names in both themes", () => {
    for (const theme of THEMES) {
      for (const [name, value] of themeBlock(theme)) {
        expect(value, `${name} in ${theme}`).toMatch(OPAQUE_HEX);
      }
    }
    expect([...themeBlock("dark").keys()].sort()).toEqual([...themeBlock("light").keys()].sort());
    expect(themeBlock("light").size).toBe(11);
  });

  it("rejects a translucent value rather than mis-computing it", () => {
    expect(() => parseHex("#00000080")).toThrow(/opaque/);
    expect(() => parseHex("rgba(0, 0, 0, 0.5)")).toThrow(/opaque/);
  });
});
