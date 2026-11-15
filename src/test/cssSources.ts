/**
 * Stylesheet-as-text helpers for the mechanism tests under `src/styles/`.
 *
 * jsdom applies no stylesheet, so identity rules (declared tokens, flatness,
 * square corners, one serif rule) are checked against the source text instead,
 * the same approach `tokens.colorLiteral.test.ts` and `layout.test.ts` take.
 */

import fs from "node:fs";
import path from "node:path";

export const SRC = path.resolve(__dirname, "..");

/** Every file under `dir` whose name ends with `suffix`, sorted for stable output. */
export function walk(dir: string, suffix: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, suffix, out);
    else if (entry.name.endsWith(suffix)) out.push(full);
  }
  return out.sort();
}

/** Every stylesheet under `src/`. */
export function stylesheets(): string[] {
  return walk(SRC, ".css");
}

/** Every component source under `src/`, tests excluded. */
export function componentSources(): string[] {
  return walk(SRC, ".tsx").filter((file) => !/\.(test|spec)\.tsx$/.test(file));
}

export function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

export interface Declaration {
  /** Selector or at-rule prelude of the innermost block holding the declaration. */
  selector: string;
  property: string;
  value: string;
}

/**
 * Every declaration in a stylesheet, attributed to its innermost block.
 *
 * Innermost blocks are matched first and blanked out, so a rule nested in
 * `@media` is still read with its own selector rather than the at-rule's.
 */
export function declarationsIn(css: string): Declaration[] {
  const declarations: Declaration[] = [];
  let source = stripComments(css);
  const leaf = /([^{};]*)\{([^{}]*)\}/g;

  for (let pass = 0; pass < 10 && source.includes("{"); pass += 1) {
    source = source.replace(leaf, (_, selector: string, body: string) => {
      for (const raw of body.split(";")) {
        const colon = raw.indexOf(":");
        if (colon === -1) continue;
        declarations.push({
          selector: selector.trim().replace(/\s+/g, " "),
          property: raw.slice(0, colon).trim().toLowerCase(),
          value: raw.slice(colon + 1).trim().replace(/\s+/g, " "),
        });
      }
      return "";
    });
  }
  return declarations;
}

export function relative(file: string): string {
  return path.relative(SRC, file);
}

export function read(file: string): string {
  return fs.readFileSync(file, "utf8");
}
