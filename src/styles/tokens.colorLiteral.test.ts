/**
 * `theme-system` requires that "all theme values SHALL be exposed as CSS custom
 * properties so components never hard-code colors". A colour declared anywhere
 * but `tokens.css` does not follow `data-theme`, and it also silently voids
 * `tokens.contrast.test.ts` — a contrast proof over the tokens only proves
 * anything if nothing bypasses the tokens.
 *
 * Two surfaces are scanned, because checking only the first would leave an
 * obvious hole: stylesheets, and inline `style={{ … }}` props in TSX, which is
 * the easiest way to hard-code a colour in React.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");
const TOKENS_FILE = path.join(SRC, "styles", "tokens.css");

/** Not colours in the sense the requirement means — they inherit or defer. */
const ALLOWED_KEYWORDS = new Set(["transparent", "currentcolor", "inherit", "none", "unset", "initial"]);

/**
 * Named CSS colours that are plausible in this codebase. The full list is 148
 * entries and most are unmistakable typos; these are the ones a developer
 * actually reaches for.
 */
const NAMED_COLORS = [
  "aqua", "beige", "black", "blue", "brown", "coral", "crimson", "cyan", "gold", "gray", "grey",
  "green", "indigo", "ivory", "khaki", "lavender", "lime", "magenta", "maroon", "navy", "olive",
  "orange", "orchid", "pink", "plum", "purple", "red", "salmon", "silver", "snow", "tan", "teal",
  "tomato", "turquoise", "violet", "wheat", "white", "yellow",
];

const COLOR_FUNCTION = /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(/i;
const HEX = /#[0-9a-fA-F]{3,8}\b/;
const NAMED = new RegExp(`(?<![\\w-])(?:${NAMED_COLORS.join("|")})(?![\\w-])`, "i");

function walk(dir: string, extension: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, extension, out);
    else if (entry.name.endsWith(extension)) out.push(full);
  }
  return out;
}

/** Strip comments and `url(...)` so a documented hex or an asset path is not a hit. */
function scrub(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/url\([^)]*\)/gi, "url()");
}

function colorLiteralsIn(text: string): string[] {
  const hits: string[] = [];
  for (const pattern of [HEX, COLOR_FUNCTION, NAMED]) {
    const global = new RegExp(pattern.source, `${pattern.flags}g`);
    for (const match of text.matchAll(global)) {
      if (!ALLOWED_KEYWORDS.has(match[0].toLowerCase())) hits.push(match[0]);
    }
  }
  return hits;
}

describe("no component hard-codes a colour", () => {
  // @covers theme-system/dual-light-dark-themes-with-neon-gradient-identity#both-themes-render-every-shell-screen
  it("declares every colour literal in tokens.css and nowhere else", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC, ".css")) {
      if (file === TOKENS_FILE) continue;
      scrub(fs.readFileSync(file, "utf8"))
        .split("\n")
        .forEach((line, index) => {
          for (const literal of colorLiteralsIn(line)) {
            offenders.push(`${path.relative(SRC, file)}:${index + 1} → ${literal}`);
          }
        });
    }

    expect(offenders, "colours belong in tokens.css, referenced as var(--…)").toEqual([]);
  });

  it("keeps colour literals out of inline style props too", () => {
    const offenders: string[] = [];

    for (const file of walk(SRC, ".tsx")) {
      const source = fs.readFileSync(file, "utf8");
      // `style={{ … }}` up to the matching close; nesting deeper than one level
      // does not occur in JSX style objects.
      for (const match of source.matchAll(/style=\{\{([^}]*)\}\}/g)) {
        for (const literal of colorLiteralsIn(match[1])) {
          const line = source.slice(0, match.index).split("\n").length;
          offenders.push(`${path.relative(SRC, file)}:${line} → ${literal}`);
        }
      }
    }

    expect(offenders, "an inline style bypasses the theme entirely").toEqual([]);
  });

  it("fails on a hard-coded colour rather than merely tolerating one", () => {
    // Proves the scan can see what it claims to see; without this the two tests
    // above pass just as happily against a broken regular expression.
    expect(colorLiteralsIn("color: #ff0000;")).toContain("#ff0000");
    expect(colorLiteralsIn("background: rgba(0, 0, 0, 0.5);")).toContain("rgba(");
    expect(colorLiteralsIn("border-color: red;")).toContain("red");
    expect(colorLiteralsIn("background: transparent;")).toEqual([]);
    expect(colorLiteralsIn("color: var(--text-primary);")).toEqual([]);
    // A token name that merely contains a colour word is not a literal.
    expect(colorLiteralsIn("color: var(--accent-text);")).toEqual([]);
  });
});
