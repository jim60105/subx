/**
 * WCAG AA contrast over the theme tokens.
 *
 * `theme-system` requires that "all text meets readable contrast against its
 * background" in both themes. Nothing else in the suite checks that, and it is
 * not something review catches reliably — so this reads `tokens.css` itself,
 * composites the translucent surfaces the way a browser would, and computes the
 * ratios.
 *
 * It is only a proof of the requirement because `tokens.colorLiteral.test.ts`
 * separately forbids colours declared anywhere else: a contrast proof over the
 * tokens says nothing if a component can bypass them.
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
/**
 * WCAG AA for large text — ≥ 18.66px bold or ≥ 24px. The only token pair this
 * applies to is the gradient-clipped app name (`.gradient-text` on
 * `.app-header__name`, `--text-xl` = 22px at weight 700).
 */
const AA_LARGE = 3;

type Rgba = { r: number; g: number; b: number; a: number };

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
  // Split on top-level semicolons only: several values contain nested commas
  // and parentheses, but none contain a semicolon.
  for (const raw of body.split(";")) {
    const colon = raw.indexOf(":");
    if (colon === -1) continue;
    const name = raw.slice(0, colon).trim();
    if (!name.startsWith("--")) continue;
    declarations.set(name, raw.slice(colon + 1).trim().replace(/\s+/g, " "));
  }
  return declarations;
}

/** The tokens in effect for a theme: the shared `:root` block plus its override. */
function themeTokens(theme: "dark" | "light"): Map<string, string> {
  return new Map([
    ...declarationsOf(":root"),
    ...declarationsOf(`:root[data-theme="${theme}"]`),
  ]);
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

function parseColor(value: string): Rgba {
  const text = value.trim();

  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(text);
  if (hex) {
    const digits =
      hex[1].length === 3
        ? hex[1]
            .split("")
            .map((d) => d + d)
            .join("")
        : hex[1];
    return {
      r: parseInt(digits.slice(0, 2), 16),
      g: parseInt(digits.slice(2, 4), 16),
      b: parseInt(digits.slice(4, 6), 16),
      a: 1,
    };
  }

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(text);
  if (rgb) {
    const parts = rgb[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: parts[0], g: parts[1], b: parts[2], a: parts[3] ?? 1 };
  }

  // `color-mix(in srgb, <color> N%, transparent)` is the tinted-panel idiom.
  // Mixing with `transparent` leaves the colour's RGB unchanged and scales its
  // alpha by N% — so the result is alpha N% only when the colour is opaque; a
  // colour that already carries alpha multiplies through.
  const mix = /^color-mix\(\s*in srgb,\s*(.+?)\s+([\d.]+)%\s*,\s*transparent\s*\)$/i.exec(text);
  if (mix) {
    const base = parseColor(mix[1]);
    return { ...base, a: base.a * (Number(mix[2]) / 100) };
  }

  throw new Error(`Cannot parse colour "${value}"`);
}

/** The two endpoint colours of a two-stop `linear-gradient(...)`. */
function gradientEndpoints(value: string): [Rgba, Rgba] {
  const inner = /^linear-gradient\((.*)\)$/is.exec(value.trim());
  if (!inner) throw new Error(`Not a linear-gradient: "${value}"`);

  // Split on commas that are not inside parentheses, then drop the angle.
  const stops: string[] = [];
  let depth = 0;
  let current = "";
  for (const char of inner[1]) {
    if (char === "(") depth += 1;
    if (char === ")") depth -= 1;
    if (char === "," && depth === 0) {
      stops.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  stops.push(current);

  const colors = stops.slice(1).map((stop) => parseColor(stop.trim()));
  if (colors.length !== 2) throw new Error(`Expected two colour stops in "${value}"`);
  return [colors[0], colors[1]];
}

/** Composite a (possibly translucent) colour over an opaque backdrop. */
function over(top: Rgba, bottom: Rgba): Rgba {
  return {
    r: top.r * top.a + bottom.r * (1 - top.a),
    g: top.g * top.a + bottom.g * (1 - top.a),
    b: top.b * top.a + bottom.b * (1 - top.a),
    a: 1,
  };
}

function relativeLuminance({ r, g, b }: Rgba): number {
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(foreground: Rgba, background: Rgba): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [lighter, darker] = a > b ? [a, b] : [b, a];
  return (lighter + 0.05) / (darker + 0.05);
}

// --- The checks ------------------------------------------------------------

/**
 * Every text token paired with the backgrounds it is actually rendered on.
 *
 * The `where` note is the point of the table: a pair nobody renders proves
 * nothing, and a rendered pair that is missing here is a hole in the proof.
 */
const CHECKS: Array<{
  foreground: string;
  /** Layers from the page backwards; the first is nearest the text. */
  background: string[];
  where: string;
  minimum?: number;
}> = [
  { foreground: "--text-primary", background: ["--bg-base"], where: "global.css body text" },
  { foreground: "--text-primary", background: ["--surface", "--bg-base"], where: "panel headings" },
  { foreground: "--text-secondary", background: ["--bg-base"], where: "HomeScreen.css intro" },
  {
    foreground: "--text-secondary",
    background: ["--surface", "--bg-base"],
    where: "TaskCard / SettingsScreen body copy",
  },
  { foreground: "--text-muted", background: ["--bg-base"], where: "AppHeader.css tagline" },
  {
    foreground: "--text-muted",
    background: ["--surface", "--bg-base"],
    where: "WizardShell / SettingsScreen hints",
  },
  {
    foreground: "--accent-text",
    background: ["--surface", "--bg-base"],
    where: "TaskCard.css badge, WizardShell.css active step label",
  },
  {
    foreground: "--accent-text",
    background: ["--surface-hover", "--bg-base"],
    where: "AppHeader.css settings button on hover",
  },
  {
    foreground: "--danger",
    background: ["--danger-surface", "--surface", "--bg-base"],
    where: "ErrorNotice.css title",
  },
  {
    foreground: "--success",
    background: ["--success-surface", "--surface", "--bg-base"],
    where: "SettingsScreen.css connection-test success panel",
  },
];

/**
 * Gradients that carry text. Both endpoints are checked, not an average: the
 * text sits on the whole sweep, so the worst end is the one that matters.
 */
const GRADIENT_CHECKS: Array<{
  foreground: string;
  gradient: string;
  where: string;
  minimum: number;
}> = [
  {
    foreground: "--text-on-accent",
    gradient: "--accent-gradient-strong",
    where: "TaskCard.css:40, WizardShell.css:34 and :106, SettingsScreen.css:145",
    minimum: AA_NORMAL,
  },
];

/**
 * Text painted *with* a gradient via `background-clip: text`, checked against
 * the page background instead.
 */
const CLIPPED_TEXT_CHECKS: Array<{
  gradient: string;
  background: string;
  where: string;
  minimum: number;
}> = [
  {
    gradient: "--accent-gradient-strong",
    background: "--bg-base",
    where: "global.css .gradient-text on AppHeader's app name (22px / 700 — large text)",
    minimum: AA_LARGE,
  },
];

function stack(layers: string[], tokens: Map<string, string>): Rgba {
  // Bottom layer first, compositing each one over the result.
  return layers
    .map((token) => parseColor(resolve(`var(${token})`, tokens)))
    .reduceRight((backdrop, layer) => over(layer, backdrop));
}

describe.each(["dark", "light"] as const)("%s theme", (theme) => {
  const tokens = themeTokens(theme);

  // @covers theme-system/dual-light-dark-themes-with-neon-gradient-identity#both-themes-render-every-shell-screen
  it.each(CHECKS)(
    "$foreground on $background meets AA ($where)",
    ({ foreground, background, minimum = AA_NORMAL }) => {
      const ratio = contrastRatio(
        parseColor(resolve(`var(${foreground})`, tokens)),
        stack(background, tokens),
      );
      expect(Number(ratio.toFixed(2))).toBeGreaterThanOrEqual(minimum);
    },
  );

  it.each(GRADIENT_CHECKS)(
    "$foreground on $gradient meets AA at its worst endpoint ($where)",
    ({ foreground, gradient, minimum }) => {
      const text = parseColor(resolve(`var(${foreground})`, tokens));
      const page = parseColor(resolve("var(--bg-base)", tokens));
      const worst = Math.min(
        ...gradientEndpoints(resolve(`var(${gradient})`, tokens)).map((endpoint) =>
          contrastRatio(text, over(endpoint, page)),
        ),
      );
      expect(Number(worst.toFixed(2))).toBeGreaterThanOrEqual(minimum);
    },
  );

  it.each(CLIPPED_TEXT_CHECKS)(
    "$gradient as clipped text on $background meets AA at its worst endpoint ($where)",
    ({ gradient, background, minimum }) => {
      const page = parseColor(resolve(`var(${background})`, tokens));
      const worst = Math.min(
        ...gradientEndpoints(resolve(`var(${gradient})`, tokens)).map((endpoint) =>
          contrastRatio(over(endpoint, page), page),
        ),
      );
      expect(Number(worst.toFixed(2))).toBeGreaterThanOrEqual(minimum);
    },
  );

  it("declares a text colour for every pair the table checks", () => {
    for (const { foreground, background } of CHECKS) {
      expect(tokens.has(foreground), `${foreground} missing in ${theme}`).toBe(true);
      for (const layer of background) {
        expect(tokens.has(layer), `${layer} missing in ${theme}`).toBe(true);
      }
    }
  });
});

describe("the gradient identity is shared, not duplicated", () => {
  it("derives both accent gradients from the same violet origin", () => {
    // `theme-system` requires accent elements to "use the shared gradient in
    // both themes". The text-bearing variant darkens only the cyan endpoint, so
    // the identity stays one gradient rather than two unrelated ones.
    const tokens = themeTokens("dark");
    expect(tokens.get("--accent-gradient")).toContain("var(--accent-from)");
    expect(tokens.get("--accent-gradient-strong")).toContain("var(--accent-from)");
  });

  it("is identical in both themes", () => {
    for (const name of ["--accent-from", "--accent-to", "--accent-gradient", "--accent-gradient-strong"]) {
      expect(themeTokens("dark").get(name)).toBe(themeTokens("light").get(name));
    }
  });
});
