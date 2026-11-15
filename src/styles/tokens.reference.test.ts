/**
 * Every `var(--name)` must resolve to a declared custom property.
 *
 * The editorial token set replaced the glass-era names outright, without
 * aliases. A reference to a removed name is not an error to a browser — the
 * declaration silently falls back — so nothing would show it except this scan.
 */

import path from "node:path";
import { describe, expect, it } from "vitest";
import { SRC, componentSources, read, relative, stripComments, stylesheets } from "../test/cssSources";

const TOKENS_FILE = path.join(SRC, "styles", "tokens.css");

/** Custom properties a source declares: `--x:` in CSS, `"--x":` in a style object. */
function declaredIn(text: string): Set<string> {
  return new Set([...text.matchAll(/(--[\w-]+)["']?\s*:/g)].map((match) => match[1]));
}

/** Custom properties a source reads, including `var(--x, fallback)`. */
function referencedIn(text: string): string[] {
  return [...text.matchAll(/var\(\s*(--[\w-]+)/g)].map((match) => match[1]);
}

/** `file → --name` for every reference neither the token file nor the source itself declares. */
export function undeclaredReferences(files: Array<{ name: string; text: string }>, tokens: Set<string>): string[] {
  const offenders: string[] = [];
  for (const { name, text } of files) {
    const local = declaredIn(text);
    for (const reference of new Set(referencedIn(text))) {
      if (!tokens.has(reference) && !local.has(reference)) offenders.push(`${name} → ${reference}`);
    }
  }
  return offenders;
}

describe("token references", () => {
  // @covers theme-system/dual-light-dark-themes-with-editorial-paper-and-ink-identity#every-referenced-token-is-declared
  it("resolves every var(--…) in stylesheets and components to a declared token", () => {
    const tokens = declaredIn(stripComments(read(TOKENS_FILE)));
    const files = [...stylesheets(), ...componentSources()].map((file) => ({
      name: relative(file),
      text: file.endsWith(".css") ? stripComments(read(file)) : read(file),
    }));

    expect(undeclaredReferences(files, tokens), "a removed legacy token is still referenced").toEqual([]);
  });

  it("reports a made-up name and accepts a locally declared one", () => {
    const tokens = new Set(["--ink"]);
    const files = [
      { name: "a.css", text: ".a { color: var(--ink); border-color: var(--surface-border, var(--ink)); }" },
      { name: "b.css", text: ".b { --local: 1px; width: var(--local); }" },
      { name: "c.tsx", text: 'style={{ "--row": 2, gap: "var(--row)" }}' },
    ];

    expect(undeclaredReferences(files, tokens)).toEqual(["a.css → --surface-border"]);
  });
});
