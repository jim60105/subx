/**
 * Layout guarantees that live entirely in CSS.
 *
 * jsdom parses stylesheets but applies none of them, so `getComputedStyle` on a
 * rendered element reports nothing about the layout it sits in. The same approach
 * `tokens.colorLiteral.test.ts` takes is used here: read the stylesheet as text
 * and assert the declarations, which is what the requirement is actually about.
 * The rendered-DOM side — the right order, the right save button — stays
 * covered by the component tests.
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

// @covers match-workflow/multi-source-selection-with-scan-preview-and-relocation-mode#relocation-choice-stays-outside-the-scrolling-list
describe("the match sources step", () => {
  const step = read("features", "match", "SourcesStep.css");
  const list = read("components", "GroupedFileList", "GroupedFileList.css");
  const shell = read("components", "WizardShell", "WizardShell.css");

  /// Each link of the height chain must let its child shrink, or the list
  /// grows to its content and the panel scrolls the relocation choice away.
  it("lets the step and its list shrink to the panel's height", () => {
    expect(declarationsOf(shell, ".wizard__content")).toMatch(/display:\s*flex/);
    expect(declarationsOf(shell, ".wizard__content")).toMatch(/flex-direction:\s*column/);
    expect(declarationsOf(step, ".sources-step")).toMatch(/min-height:\s*0/);
    expect(declarationsOf(list, ".file-groups")).toMatch(/min-height:\s*0/);
  });

  it("scrolls only the list and keeps every other part at its natural height", () => {
    expect(declarationsOf(list, ".file-groups")).toMatch(/overflow-y:\s*auto/);
    expect(declarationsOf(step, ".sources-step > :not(.file-groups)")).toMatch(/flex-shrink:\s*0/);
    expect(declarationsOf(step, ".sources-step")).not.toMatch(/overflow/);
  });

  it("reveals an entry's remove button on keyboard focus", () => {
    expect(declarationsOf(list, ".file-groups__remove:focus-visible")).toMatch(/opacity:\s*1/);
  });
});

describe("the match review step", () => {
  const css = read("features", "match", "ReviewStep.css");

  /// The step claims the panel's height and lets the ledger, not the step,
  /// scroll, so the filters above and the action bar below stay put.
  it("scrolls only the ledger", () => {
    expect(declarationsOf(css, ".review-step")).toMatch(/min-height:\s*0/);
    expect(declarationsOf(css, ".review-step")).not.toMatch(/overflow/);
    expect(declarationsOf(css, ".review-ledger")).toMatch(/overflow-y:\s*auto/);
    expect(declarationsOf(css, ".review-ledger")).toMatch(/min-height:\s*0/);
  });

  /// Rows carry visually hidden text, which is absolutely positioned; the
  /// ledger must contain it or it overflows the document past the window.
  it("contains the rows' visually hidden text inside the scroller", () => {
    expect(declarationsOf(css, ".review-ledger")).toMatch(/position:\s*relative/);
  });

  it("marks a low-confidence row with an accent rule at its inline start", () => {
    expect(declarationsOf(css, '.review-ledger__row[data-low="true"]')).toMatch(
      /border-inline-start-color:\s*var\(--accent\)/,
    );
  });
});

describe("the app header build identity", () => {
  const css = read("components", "AppHeader", "AppHeader.css");

  // @covers build-identity/version-badge-reports-the-running-build-persistently#badge-survives-the-narrowest-window
  it("keeps the badge unclipped and lets the breadcrumb title truncate", () => {
    const badge = declarationsOf(css, ".app-header__version");
    const current = declarationsOf(css, ".app-header__current");

    expect(badge).toMatch(/white-space:\s*nowrap/);
    expect(badge).toMatch(/flex-shrink:\s*0/);
    expect(badge).toMatch(/color:\s*var\(--ink-2\)/);
    expect(current).toMatch(/overflow:\s*hidden/);
    expect(current).toMatch(/text-overflow:\s*ellipsis/);
    expect(current).toMatch(/min-width:\s*0/);
    expect(current).toMatch(/white-space:\s*nowrap/);
  });
});

describe("reduced motion", () => {
  const block = blockOf(read("styles", "global.css"), "@media (prefers-reduced-motion: reduce)");

  /// A staggered reveal is a delay, not a duration: zeroing only the
  /// durations would still reveal rows one after another.
  // @covers match-workflow/execute-step-resolves-each-row-from-the-single-report#reduced-motion-reveals-the-final-state-at-once
  it("collapses every duration and delay so the final state appears at once", () => {
    const declarations = declarationsOf(block, "*::after");

    expect(declarations).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(declarations).toMatch(/animation-delay:\s*0s\s*!important/);
    expect(declarations).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(declarations).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(declarations).toMatch(/transition-delay:\s*0s\s*!important/);
  });
});

describe("the translate batch bar", () => {
  const css = read("features", "translate", "BatchProgressBar.css");

  /// The in-flight hatch keeps its marking but stops marching; fills and
  /// counters are not animations, so they still update.
  // @covers translate-workflow/run-step-progress-is-accessible-and-honours-reduced-motion#reduced-motion-keeps-the-information
  it("stops the in-flight animation under reduced motion", () => {
    const block = blockOf(css, "@media (prefers-reduced-motion: reduce)");

    expect(declarationsOf(block, ".batch-bar__segment::before")).toMatch(/animation:\s*none/);
  });
});

describe("the sync detect step", () => {
  const css = read("features", "sync", "SyncDetectStep.css");

  /// The waiting illustration is decorative; under reduced motion it stays
  /// still and the elapsed seconds carry the progress on their own.
  // @covers sync-workflow/detect-step-states#waiting-illustration-honours-reduced-motion
  it("stops the waiting illustration under reduced motion", () => {
    const block = blockOf(css, "@media (prefers-reduced-motion: reduce)");

    expect(declarationsOf(block, ".sync-detect__bar")).toMatch(/animation:\s*none/);
    // The animation starts under the listening selector, which outranks the
    // bare class, so the reduced-motion rule has to name it as well.
    expect(block).toMatch(
      /\.sync-detect__instrument\[data-listening="true"\] \.sync-detect__bar,\s*\.sync-detect__bar\s*\{[^}]*animation:\s*none/,
    );
  });
});

describe("the convert source list", () => {
  // `GroupedFileList` is built to be a pinned step's only scroller
  // (`flex: 1 1 0`). The convert step keeps natural height inside the
  // scrolling `.wizard__content`, where that basis collapses the list to
  // nothing. (Translate lists its sources in its own ledger instead.)
  it.each([
    ["convert", "ConvertSourcesStep.css", ".convert-sources .file-groups"],
  ])("lets the %s list size to its content without a scroll fade", (feature, file, selector) => {
    const declarations = declarationsOf(read("features", feature, file), selector);

    expect(declarations).toMatch(/flex:\s*none/);
    expect(declarations).toMatch(/mask-image:\s*none/);
    expect(declarations).toMatch(/padding-bottom:\s*0/);
  });
});

describe("the sync offset step", () => {
  const player = read("features", "sync", "SyncPlayer.css");
  const rule = read("features", "sync", "TimeRule.css");
  const step = read("features", "sync", "SyncOffsetStep.css");

  /// The stage takes what height is left and gives it up first, down to a
  /// floor, so the offset row stays in view on a short window.
  it("lets only the stage shrink, down to a floor", () => {
    const stage = declarationsOf(player, ".sync-player__stage");

    expect(stage).toMatch(/flex:\s*1 1 0\s*;/);
    expect(stage).toMatch(/min-height:\s*6rem/);
    expect(declarationsOf(step, ".sync-offset > :not(.sync-player)")).toMatch(/flex-shrink:\s*0/);
    expect(declarationsOf(rule, ".time-rule")).toMatch(/flex-shrink:\s*0/);
  });

  it("gives the time rule a fixed height", () => {
    expect(declarationsOf(rule, ".time-rule")).toMatch(/(^|;|\s)height:\s*74px/);
  });
});
