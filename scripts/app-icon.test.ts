/**
 * `app-icon` scenario coverage.
 *
 * Follows the release-pipeline pattern (design.md D7): the SVG sources and the
 * generated icon set are parsed directly, with a small regex-based attribute
 * reader rather than a full XML parser (design.md D7 / tasks.md 3.1) — every
 * attribute the sources declare is a plain, single-line, greppable string.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "..");

const MASTER_PATH = path.join(ROOT, "assets/brand/subx-icon.svg");
const MACOS_PATH = path.join(ROOT, "assets/brand/subx-icon-macos.svg");
const MONO_PATH = path.join(ROOT, "assets/brand/subx-mark-mono.svg");
const ICONS_DIR = path.join(ROOT, "src-tauri/icons");
const TAURI_CONF_PATH = path.join(ROOT, "src-tauri/tauri.conf.json");
const STOCK_DIGESTS_PATH = path.join(ROOT, "scripts/app-icon.stock-digests.json");
const TOKENS_CSS_PATH = path.join(ROOT, "src/styles/tokens.css");

const MASTER = fs.readFileSync(MASTER_PATH, "utf8");
const MACOS = fs.readFileSync(MACOS_PATH, "utf8");
const MONO = fs.readFileSync(MONO_PATH, "utf8");

const SOURCES = [
  { name: "master", path: MASTER_PATH, svg: MASTER },
  { name: "macos", path: MACOS_PATH, svg: MACOS },
  { name: "mono", path: MONO_PATH, svg: MONO },
];

// --- SVG attribute reader ---------------------------------------------------

interface ViewBox {
  minX: number;
  minY: number;
  width: number;
  height: number;
}

function readViewBox(svg: string): ViewBox {
  const match = /viewBox="([-\d.\s]+)"/.exec(svg);
  if (!match) throw new Error("no viewBox attribute found");
  const [minX, minY, width, height] = match[1].trim().split(/\s+/).map(Number);
  return { minX, minY, width, height };
}

/** The `<mask id="…">…</mask>` block, if any, and the source with it removed. */
function splitOffMask(svg: string): { maskId: string | null; maskBody: string; rest: string } {
  const match = /<mask\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/mask>/.exec(svg);
  if (!match) return { maskId: null, maskBody: "", rest: svg };
  return { maskId: match[1], maskBody: match[2], rest: svg.slice(0, match.index) + svg.slice(match.index + match[0].length) };
}

/** Attribute values of every top-level `<line>` element (outside any `<mask>`). */
function topLevelLineTags(svg: string): string[] {
  const { rest } = splitOffMask(svg);
  return [...rest.matchAll(/<line\b([^>]*)\/?>/g)].map((m) => m[1]);
}

function attr(tagAttrs: string, name: string): string | undefined {
  const match = new RegExp(`${name}="([^"]*)"`).exec(tagAttrs);
  return match?.[1];
}

/** Every `stop-color="#…"` inside the `<linearGradient id="plate">` block, in document order. */
function plateGradientStops(svg: string): string[] {
  const block = /<linearGradient\b[^>]*\bid="plate"[^>]*>([\s\S]*?)<\/linearGradient>/.exec(svg);
  if (!block) throw new Error("no plate linearGradient found");
  return [...block[1].matchAll(/stop-color="(#[0-9a-fA-F]{6})"/g)].map((m) => m[1].toLowerCase());
}

// --- WCAG 2.1 relative luminance / contrast --------------------------------

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function parseHex(hex: string): Rgb {
  const match = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!match) throw new Error(`not a 6-digit hex colour: "${hex}"`);
  const digits = match[1];
  return {
    r: parseInt(digits.slice(0, 2), 16),
    g: parseInt(digits.slice(2, 4), 16),
    b: parseInt(digits.slice(4, 6), 16),
  };
}

/** Composite `top` (with alpha 0–1) over an opaque `bottom`. */
function over(top: Rgb, alpha: number, bottom: Rgb): Rgb {
  return {
    r: top.r * alpha + bottom.r * (1 - alpha),
    g: top.g * alpha + bottom.g * (1 - alpha),
    b: top.b * alpha + bottom.b * (1 - alpha),
  };
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const srgb = value / 255;
    return srgb <= 0.04045 ? srgb / 12.92 : ((srgb + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [lighter, darker] = la > lb ? [la, lb] : [lb, la];
  return (lighter + 0.05) / (darker + 0.05);
}

/**
 * Sample points evenly along the plate's two-stop gradient, including both
 * endpoints. Checking only the two authored stops finds the gradient's true
 * worst-case contrast only when the comparator's luminance falls outside the
 * range the gradient spans; if a future re-tint ever brackets a comparator's
 * luminance between the two stops, the true minimum sits mid-gradient, not at
 * either end. Sampling is cheap and removes that assumption.
 */
function plateGradientSamples(svg: string, steps = 20): Rgb[] {
  const [start, end] = plateGradientStops(svg).map(parseHex);
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    return {
      r: start.r + (end.r - start.r) * t,
      g: start.g + (end.g - start.g) * t,
      b: start.b + (end.b - start.b) * t,
    };
  });
}

// --- tokens.css: resolve --accent-gradient-strong ---------------------------

/**
 * Resolve the two colour stops of `--accent-gradient-strong`. The declaration
 * is `linear-gradient(135deg, #c64916, var(--accent-to))` — one literal hex
 * and one `var()` reference that must be followed to `--accent-to`'s own
 * declaration (design.md D6). A single regex over that one line would find
 * only half the pair.
 */
function resolveAccentGradientStrong(): [string, string] {
  const css = fs.readFileSync(TOKENS_CSS_PATH, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const declMatch = /--accent-gradient-strong:\s*([^;]+);/.exec(css);
  if (!declMatch) throw new Error("--accent-gradient-strong not declared in tokens.css");

  const partsMatch = /linear-gradient\([^,]+,\s*(#[0-9a-fA-F]{6})\s*,\s*var\((--[\w-]+)\)\s*\)/.exec(declMatch[1]);
  if (!partsMatch) throw new Error(`cannot parse --accent-gradient-strong: "${declMatch[1]}"`);

  const literalStop = partsMatch[1].toLowerCase();
  const varName = partsMatch[2];
  const varMatch = new RegExp(`${varName}:\\s*(#[0-9a-fA-F]{6})\\s*;`).exec(css);
  if (!varMatch) throw new Error(`${varName} not declared in tokens.css`);

  return [literalStop, varMatch[1].toLowerCase()];
}

// --- PNG IHDR reader ---------------------------------------------------------

/** Pixel dimensions declared in a PNG's IHDR chunk (8 bytes at offset 16, big-endian). */
function pngDimensions(filePath: string): { width: number; height: number } {
  const buf = fs.readFileSync(filePath);
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function sha256File(filePath: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

// =============================================================================
// Requirement: The application icon is generated from a committed vector source
// =============================================================================

describe("the application icon is generated from a committed vector source", () => {
  // @covers app-icon/the-application-icon-is-generated-from-a-committed-vector-source#the-source-is-a-square-self-contained-svg
  it.each(SOURCES)("$name source is a square, self-contained SVG", ({ svg }) => {
    const viewBox = readViewBox(svg);
    expect(viewBox.width).toBe(viewBox.height);

    expect(svg).not.toMatch(/<image[\s>]/i);
    expect(svg).not.toMatch(/<text[\s>]/i);
    expect(svg).not.toMatch(/<filter[\s>]/i);
    expect(svg).not.toMatch(/@font-face/i);

    // Every url()/href reference must be an in-file fragment, and the only
    // "http" string permitted is the mandatory SVG namespace declaration.
    const urlRefs = [...svg.matchAll(/url\(\s*['"]?([^'")]+)['"]?\s*\)/g)].map((m) => m[1]);
    const hrefRefs = [...svg.matchAll(/(?:xlink:)?href="([^"]+)"/g)].map((m) => m[1]);
    for (const ref of [...urlRefs, ...hrefRefs]) {
      expect(ref.startsWith("#"), `reference "${ref}" is not an in-file fragment`).toBe(true);
    }

    const httpRefs = [...svg.matchAll(/https?:\/\/[^\s"')]+/g)].map((m) => m[0]);
    expect(httpRefs).toEqual(["http://www.w3.org/2000/svg"]);
  });

  // @covers app-icon/the-application-icon-is-generated-from-a-committed-vector-source#generated-output-carries-no-hand-authored-source
  it("src-tauri/icons/ contains no hand-authored SVG", () => {
    const svgFiles = fs.readdirSync(ICONS_DIR, { recursive: true }).filter((f) => String(f).endsWith(".svg"));
    expect(svgFiles).toEqual([]);
  });
});

// =============================================================================
// Requirement: The mark stays inside the product's declared brand palette
// =============================================================================

describe("the mark stays inside the product's declared brand palette", () => {
  // @covers app-icon/the-mark-stays-inside-the-product-s-declared-brand-palette#the-backplate-gradient-is-the-token-gradient
  it("the backplate gradient is exactly --accent-gradient-strong", () => {
    const tokenStops = resolveAccentGradientStrong();
    const iconStops = plateGradientStops(MASTER);
    expect(iconStops).toEqual(tokenStops);
  });

  // @covers app-icon/the-mark-stays-inside-the-product-s-declared-brand-palette#the-foreground-clears-wcag-aa-against-every-point-of-the-plate
  it("white foreground clears 4.5:1 against every sampled point of the plate", () => {
    const white: Rgb = { r: 255, g: 255, b: 255 };
    const worst = Math.min(...plateGradientSamples(MASTER).map((colour) => contrastRatio(white, colour)));
    expect(worst).toBeGreaterThanOrEqual(4.5);
  });

  // @covers app-icon/the-mark-stays-inside-the-product-s-declared-brand-palette#the-tile-is-distinguishable-from-the-surfaces-it-sits-on
  it("the tile's outer edge clears 3:1 against both application bases", () => {
    // The outermost pixels are plate colour only — the rim sits 3px inset
    // (design.md §1.4) — so the worst-case point along the gradient is what
    // must clear 3:1, not just its two authored stops.
    const appBases: Rgb[] = [{ r: 0x14, g: 0x15, b: 0x18 }, { r: 0xf9, g: 0xf8, b: 0xf6 }];
    for (const base of appBases) {
      const worst = Math.min(...plateGradientSamples(MASTER).map((colour) => contrastRatio(colour, base)));
      expect(worst).toBeGreaterThanOrEqual(3);
    }
  });

  // @covers app-icon/the-mark-stays-inside-the-product-s-declared-brand-palette#the-tile-edge-survives-the-darkest-chrome-it-ships-against
  it("the inset rim, but not the plate alone, clears 3:1 against the darkest shipping chrome", () => {
    const darkChrome: Rgb = { r: 0x20, g: 0x21, b: 0x24 };
    const rimMatch = /stroke="#ffffff"\s+stroke-opacity="([\d.]+)"\s+stroke-width="6"/.exec(MASTER);
    if (!rimMatch) throw new Error("could not find the rim's stroke-opacity in the master source");
    const rimOpacity = Number(rimMatch[1]);

    const samples = plateGradientSamples(MASTER);

    const rimComposited = samples.map((colour) => over({ r: 255, g: 255, b: 255 }, rimOpacity, colour));
    const worstRim = Math.min(...rimComposited.map((colour) => contrastRatio(colour, darkChrome)));
    expect(worstRim).toBeGreaterThanOrEqual(3);

    // Guard: without the rim, the plate alone must fail this bar — otherwise
    // this test would pass even if the rim were thinned to nothing.
    const worstPlateAlone = Math.min(...samples.map((colour) => contrastRatio(colour, darkChrome)));
    expect(worstPlateAlone).toBeLessThan(3);
  });
});

// =============================================================================
// Requirement: The mark's construction is held to its specification
// =============================================================================

describe("the mark's construction is held to its specification", () => {
  // @covers app-icon/the-mark-s-construction-is-held-to-its-specification#stroke-weight-cannot-silently-drop-below-the-floor
  it("both bands' stroke width is at least 12.5% of the canvas", () => {
    const viewBox = readViewBox(MASTER);
    const bandTags = topLevelLineTags(MASTER);
    expect(bandTags).toHaveLength(2);
    for (const bandTag of bandTags) {
      const strokeWidth = Number(attr(bandTag, "stroke-width"));
      expect(strokeWidth / viewBox.width).toBeGreaterThanOrEqual(0.125);
    }
  });

  // @covers app-icon/the-mark-s-construction-is-held-to-its-specification#the-weave-is-wired-to-exactly-one-band
  it("the weave mask is declared and wired to exactly one band", () => {
    const { maskId, rest } = splitOffMask(MASTER);
    expect(maskId).not.toBeNull();

    const maskedBands = [...rest.matchAll(/<line\b[^>]*\bmask="url\(#([^)]+)\)"/g)].filter(
      (m) => m[1] === maskId,
    );
    expect(maskedBands).toHaveLength(1);
  });
});

// =============================================================================
// Requirement: The macOS icon follows the platform's icon grid
// =============================================================================

describe("the macOS icon follows the platform's icon grid", () => {
  // @covers app-icon/the-macos-icon-follows-the-platform-s-icon-grid#a-separate-macos-source-declares-the-inset-body
  it("the macOS source declares the same canvas, inset to the icon-grid body ratio", () => {
    const masterViewBox = readViewBox(MASTER);
    const macosViewBox = readViewBox(MACOS);
    expect(macosViewBox).toEqual(masterViewBox);

    // Big Sur grid: 824/1024 body ratio.
    const expectedRatio = 824 / 1024;
    const scaleMatch = /scale\(([\d.]+)\)/.exec(MACOS);
    if (!scaleMatch) throw new Error("no scale() transform found in the macOS source");
    expect(Number(scaleMatch[1])).toBeCloseTo(expectedRatio, 3);
  });

  // @covers app-icon/the-macos-icon-follows-the-platform-s-icon-grid#the-macos-slot-is-recorded-as-built-from-the-macos-source
  it("the generation record attributes icon.icns to the macOS source and everything else to the master", () => {
    const record = JSON.parse(fs.readFileSync(path.join(ICONS_DIR, ".icon-source.json"), "utf8"));
    expect(record.outputs["icon.icns"]).toBe("macos");
    for (const [slot, source] of Object.entries(record.outputs) as [string, string][]) {
      if (slot === "icon.icns") continue;
      expect(source, `slot "${slot}"`).toBe("master");
    }
  });
});

// =============================================================================
// Requirement: Every declared icon slot is filled and no framework artwork remains
// =============================================================================

describe("every declared icon slot is filled and no framework artwork remains", () => {
  const tauriConf = JSON.parse(fs.readFileSync(TAURI_CONF_PATH, "utf8"));
  const bundleIconPaths: string[] = tauriConf.bundle.icon;

  // @covers app-icon/every-declared-icon-slot-is-filled-and-no-framework-artwork-remains#the-bundle-icon-list-resolves
  it("every path in bundle.icon resolves to an existing file", () => {
    expect(bundleIconPaths.length).toBeGreaterThan(0);
    for (const relPath of bundleIconPaths) {
      const resolved = path.join(ROOT, "src-tauri", relPath);
      expect(fs.existsSync(resolved), relPath).toBe(true);
    }
  });

  // Declared, not inferred, dimensions (design.md D5): filenames are not a
  // reliable statement of size (`128x128@2x.png` is 256×256; `icon.png` and
  // `StoreLogo.png` carry no size in their name at all).
  const EXPECTED_PNG_SIZES: Record<string, number> = {
    "32x32.png": 32,
    "64x64.png": 64,
    "128x128.png": 128,
    "128x128@2x.png": 256,
    "icon.png": 512,
    "StoreLogo.png": 50,
    "Square30x30Logo.png": 30,
    "Square44x44Logo.png": 44,
    "Square71x71Logo.png": 71,
    "Square89x89Logo.png": 89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
  };

  // @covers app-icon/every-declared-icon-slot-is-filled-and-no-framework-artwork-remains#each-raster-matches-its-declared-size
  it.each(Object.entries(EXPECTED_PNG_SIZES))("%s is %ipx square", (fileName, expected) => {
    const { width, height } = pngDimensions(path.join(ICONS_DIR, fileName));
    expect(width).toBe(expected);
    expect(height).toBe(expected);
  });

  // @covers app-icon/every-declared-icon-slot-is-filled-and-no-framework-artwork-remains#no-stock-framework-icon-survives
  it("no committed icon still matches the stock Tauri artwork it replaced", () => {
    const stockDigests: Record<string, string> = JSON.parse(fs.readFileSync(STOCK_DIGESTS_PATH, "utf8"));
    for (const [relPath, stockDigest] of Object.entries(stockDigests)) {
      const actual = sha256File(path.join(ROOT, relPath));
      expect(actual, relPath).not.toBe(stockDigest);
    }
  });

  // @covers app-icon/every-declared-icon-slot-is-filled-and-no-framework-artwork-remains#unshipped-platform-output-is-not-committed
  it("no android/ or ios/ output is committed under src-tauri/icons/", () => {
    expect(fs.existsSync(path.join(ICONS_DIR, "android"))).toBe(false);
    expect(fs.existsSync(path.join(ICONS_DIR, "ios"))).toBe(false);
  });
});

// =============================================================================
// Requirement: A stale icon set fails verification
// =============================================================================

describe("a stale icon set fails verification", () => {
  // @covers app-icon/a-stale-icon-set-fails-verification#the-gate-runs-as-part-of-the-standard-verification-suite
  it("npm run verify runs the icon check", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts.verify).toMatch(/icons:check/);
    expect(pkg.scripts["icons:check"]).toBeTruthy();
  });
});
