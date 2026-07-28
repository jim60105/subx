/**
 * Layout guarantees that live entirely in CSS.
 *
 * jsdom parses stylesheets but applies none of them, so `getComputedStyle` on a
 * rendered card reports nothing about the grid it sits in. The same approach
 * `tokens.colorLiteral.test.ts` takes is used here: read the stylesheet as text
 * and assert the declarations, which is what the requirement is actually about.
 * The rendered-DOM side — four cards, the right order, the right save button —
 * stays covered by the component tests.
 */

import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const SRC = path.resolve(__dirname, "..");

function read(...segments: string[]): string {
  return fs.readFileSync(path.join(SRC, ...segments), "utf8");
}

/** The declarations of the first rule whose selector list mentions `selector`. */
function declarationsOf(css: string, selector: string, scope?: string): string {
  const source = scope === undefined ? css : blockOf(css, scope);
  const pattern = new RegExp(`(^|[},])\\s*${escape(selector)}\\s*\\{([^}]*)\\}`, "m");
  const match = pattern.exec(source);
  if (match === null) throw new Error(`no rule for ${selector}`);
  return match[2];
}

/** The body of an at-rule such as `@media (width <= 40rem)`. */
function blockOf(css: string, atRule: string): string {
  const start = css.indexOf(atRule);
  if (start === -1) throw new Error(`no at-rule ${atRule}`);
  const open = css.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < css.length; i += 1) {
    if (css[i] === "{") depth += 1;
    else if (css[i] === "}") {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  throw new Error(`unterminated at-rule ${atRule}`);
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

describe("the home hub grid", () => {
  const css = read("features", "home", "HomeScreen.css");

  /*
   * Four tasks in a `repeat(auto-fit, …)` grid reflowed into 3 + 1 at ordinary
   * window widths, which is what the fixed column count is here to prevent.
   */
  // @covers app-shell/desktop-application-launches-with-the-home-task-entry-hub#task-cards-form-a-two-by-two-grid
  it("declares exactly two equal columns", () => {
    const declarations = declarationsOf(css, ".home__grid");

    expect(declarations).toMatch(/grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
    expect(declarations).not.toMatch(/auto-fit|auto-fill/);
  });

  // @covers app-shell/desktop-application-launches-with-the-home-task-entry-hub#narrow-window-collapses-to-one-column
  it("collapses to a single column below 40rem", () => {
    const declarations = declarationsOf(css, ".home__grid", "@media (width <= 40rem)");

    expect(declarations).toMatch(/grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  });

  /// Grid items stretch, but a `<button>`'s own box does not follow suit in
  /// every engine, so cards in a row would end up at different heights.
  it("lets a card fill its row", () => {
    const declarations = declarationsOf(
      read("components", "TaskCard", "TaskCard.css"),
      ".task-card",
    );

    expect(declarations).toMatch(/height:\s*100%/);
  });
});

describe("the settings commit row", () => {
  // @covers app-shell/uniform-primary-action-placement-across-feature-screens#settings-commits-from-the-same-side
  it("aligns to the inline end, the same side as every wizard's primary action", () => {
    const declarations = declarationsOf(
      read("features", "settings", "SettingsScreen.css"),
      ".settings__actions",
    );

    expect(declarations).toMatch(/justify-content:\s*flex-end/);
  });
});

describe("the wizard action bar", () => {
  const css = read("components", "WizardShell", "WizardShell.css");

  /// Its height must not depend on whether the step filled it, or the panel
  /// above would resize from step to step.
  it("reserves a control's height even when empty", () => {
    expect(declarationsOf(css, ".wizard__actions")).toMatch(
      /min-height:\s*var\(--control-height-lg\)/,
    );
  });

  /// This is what pins the primary control to the inline end when there is no
  /// back action, and keeps a lone back action from sliding into its place.
  it("pushes the primary cluster to the inline end on its own", () => {
    expect(declarationsOf(css, ".wizard__actions-end")).toMatch(
      /margin-inline-start:\s*auto/,
    );
  });
});
