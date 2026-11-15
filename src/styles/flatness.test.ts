/**
 * The editorial identity is flat: no glass, gradient, glow, or shadow, square
 * corners, and an ink-filled primary button. Each rule is read from stylesheet
 * text (jsdom applies no CSS) and each matcher has a self-check proving it can
 * fail.
 */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, declarationsIn, read, relative, stylesheets } from "../test/cssSources";
import type { Declaration } from "../test/cssSources";

/** Properties whose value may legitimately hold a gradient: a mask fades content, it paints nothing. */
const MASK_PROPERTIES = new Set(["mask", "mask-image", "-webkit-mask", "-webkit-mask-image"]);
const FORBIDDEN_PROPERTIES = new Set([
  "backdrop-filter",
  "-webkit-backdrop-filter",
  "box-shadow",
  "-webkit-box-shadow",
  "text-shadow",
]);
const ALLOWED_RADII = new Set(["var(--radius-control)", "0", "50%"]);

export function depthViolations(declarations: Declaration[]): string[] {
  const offenders: string[] = [];
  for (const { selector, property, value } of declarations) {
    const where = `${selector} { ${property}: ${value} }`;
    if (FORBIDDEN_PROPERTIES.has(property)) offenders.push(where);
    // A `transition` list naming one of them still keeps the effect alive.
    else if (/(^|[\s,])(-webkit-)?(backdrop-filter|box-shadow|text-shadow)\b/.test(value)) offenders.push(where);
    else if (/(^|-)filter$/.test(property) && /(blur|drop-shadow)\(/.test(value)) offenders.push(where);
    else if (/color-mix\(/i.test(value)) offenders.push(where);
    else if (/gradient\(/i.test(value) && !MASK_PROPERTIES.has(property)) offenders.push(where);
  }
  return offenders;
}

export function radiusViolations(declarations: Declaration[]): string[] {
  return declarations
    .filter(({ property }) => /^border(-[a-z]+)*-radius$/.test(property))
    .filter(({ value }) => !ALLOWED_RADII.has(value))
    .map(({ selector, property, value }) => `${selector} { ${property}: ${value} }`);
}

function scan(check: (declarations: Declaration[]) => string[]): string[] {
  return stylesheets().flatMap((file) =>
    check(declarationsIn(read(file))).map((offender) => `${relative(file)}: ${offender}`),
  );
}

describe("flat surfaces", () => {
  // @covers theme-system/dual-light-dark-themes-with-editorial-paper-and-ink-identity#no-glass-gradient-glow-or-shadow
  it("declares no blur, shadow, colour mix, or gradient outside a mask", () => {
    expect(scan(depthViolations)).toEqual([]);
  });

  // @covers theme-system/dual-light-dark-themes-with-editorial-paper-and-ink-identity#corners-are-square
  it("declares every corner radius as the control radius, zero, or a circle", () => {
    expect(scan(radiusViolations)).toEqual([]);
  });

  // @covers theme-system/dual-light-dark-themes-with-editorial-paper-and-ink-identity#primary-buttons-are-ink-filled
  it("fills the primary button with ink and never with the accent", () => {
    const declarations = declarationsIn(read(path.join(SRC, "styles", "buttons.css")));
    const primary = declarations.filter(({ selector }) => selector === ".button--primary");

    expect(primary).toContainEqual({ selector: ".button--primary", property: "background", value: "var(--ink)" });
    expect(primary).toContainEqual({ selector: ".button--primary", property: "color", value: "var(--on-ink)" });
    expect(
      declarations.filter(({ property, value }) => property.startsWith("background") && /var\(--accent\)/.test(value)),
    ).toEqual([]);
  });

  it("would notice each forbidden treatment", () => {
    const css = `
      .a { backdrop-filter: blur(4px); }
      .b { transition: color 1s, box-shadow 1s; }
      .c { filter: blur(2px); }
      .c2 { filter: drop-shadow(0 1px 2px black); }
      .c3 { -webkit-box-shadow: 0 0 1px black; }
      .d { color: color-mix(in srgb, red 10%, transparent); }
      @media (width > 1px) { .e { background: linear-gradient(red, blue); } }
      .f { mask-image: linear-gradient(black, transparent); filter: none; }
      .g { border-radius: 999px; border-top-left-radius: 0; }
      .h { border-radius: var(--radius-control); }
    `;
    const declarations = declarationsIn(css);

    expect(depthViolations(declarations).map((offender) => offender.split(" ")[0])).toEqual([
      ".a",
      ".b",
      ".c",
      ".c2",
      ".c3",
      ".d",
      ".e",
    ]);
    expect(radiusViolations(declarations)).toEqual([".g { border-radius: 999px }"]);
  });
});
