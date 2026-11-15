# Proposal: editorial-visual-foundation

## Why

The app's glassmorphism look (translucent panels, blur, neon gradient, glow) is being replaced by the approved "Editorial Desk" identity in `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md`: paper and ink, serif headings, hairline rules, no cards. This change lays the foundation every later change builds on, so the token set, the bundled serif, and the shell chrome land once and the wizard redesigns never have to restyle twice.

## What Changes

- **BREAKING (internal)**: `src/styles/tokens.css` is rewritten to the editorial token set (`--paper`, `--paper-2`, `--ink`, `--ink-2`, `--ink-3`, `--hair`, `--accent`, `--accent-ink`, `--on-ink`, `--add`, `--del`). Every legacy token (`--surface*`, `--text-*` colour tokens, `--accent-gradient*`, `--accent-from/to`, `--accent-text`, `--bg-*`, `--shadow-*`, `--danger*`, `--success*`, `--focus-ring`, `--radius-sm/md/lg/pill`) is deleted, not aliased, together with every `backdrop-filter`, `box-shadow`, gradient, and `color-mix` use. Every stylesheet under `src/` is swept onto the new tokens.
- The UoqMunThenKhung (宇文天穹) Regular typeface is bundled as a WOFF2 asset with a local `@font-face`; sans and mono become system font stacks. A test proves the font covers every character of every locale string. The WOFF2 size is measured and recorded.
- `tokens.contrast.test.ts` is rewritten against the new tokens and remains the WCAG AA proof; three new stylesheet mechanism tests guard token references, flatness (no glass/gradient/shadow), and square corners.
- Title bar: the brand becomes a breadcrumb (`SubX / <current screen>`); `SubX` is the home link off the hub; the tagline is removed; the settings control becomes a text control.
- Stepper: `01 Sources  02 Analysis …` on a hairline; the "Step 1 of 4" line stays for assistive technology only.
- Buttons: one shared stylesheet with three ranks (primary solid ink, secondary ink outline, tertiary text-only).
- Home: a numbered list replaces the 2 × 2 card grid; each row's description becomes a visual specimen; the subheading is removed.
- No wizard step content is restructured; steps only adopt the new look through tokens.

Human-reviewed, not specified: visual fidelity to the mockup, typographic polish, and the overall "editorial" feel are judged by the owner using `visual-review.md` in this change directory. No requirement below asserts them.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `theme-system`: the identity requirement is renamed and rewritten (editorial paper and ink, marker-only accent, no glass/gradient/shadow); a new requirement covers the bundled serif. The `## Purpose` line is updated when the delta is synced. Follow-system, override, and popover requirements are unchanged.
- `app-shell`: the home hub requirement is removed and re-added as a numbered list with specimens (a MODIFIED block cannot drop its two grid scenarios); the header home affordance becomes a breadcrumb that names the current screen; the header no longer blurs; a new requirement covers the two-digit stepper and the hidden step counter.
- `build-identity`: the narrowest-window scenario names the breadcrumb title, not the removed tagline, as the element that truncates first.
- `app-icon`: the palette requirement tied the icon's backplate to the `--accent-gradient-strong` token, which this change deletes. It is removed and re-added as "The mark's colours are brand constants declared in its source": the artwork is unchanged, its gradient is checked for drift between the icon sources instead of against a token, and the contrast scenarios carry over against the new window backgrounds. (Added during apply, when the deleted token broke `scripts/app-icon.test.ts`.)

## Impact

- Styles: `src/styles/tokens.css`, `global.css`, new `fonts.css` and `buttons.css`, and every `*.css` under `src/components/` and `src/features/`.
- Components: `AppHeader`, `WizardShell`, `HomeScreen`, `App.tsx`; `TaskCard`, `TaskIcons`, and `SettingsIcon` are deleted; new `TaskRow` and `TaskSpecimen`.
- Assets: new `src/assets/fonts/` (WOFF2, `OFL.txt`, `README.md` with provenance and measured size).
- Locales: `common.tagline` and `home.subheading` deleted from `en` and `zh-TW`; `home.specimens.translate.*` added to both.
- Tests: `tokens.contrast.test.ts` rewritten; `scripts/app-icon.test.ts` palette tests re-based on the icon sources and `--paper`; `tokens.colorLiteral.test.ts`, `layout.test.ts`, `hardCodedStrings.test.tsx`, `AppHeader.test.tsx`, `App.test.tsx`, `WizardShell.test.tsx`, `HomeScreen.test.tsx` updated; new `tokens.reference.test.ts`, `flatness.test.ts`, `fontCoverage.test.ts`, `TaskRow.test.tsx`.
- Dependencies: new devDependency `fontkit` (reads the WOFF2 character map in the coverage test). No runtime dependency.
- No backend, IPC, or `config.toml` change. Theme storage (`localStorage` key `subx.theme`) is untouched.

## Batch: editorial-redesign

- depends-on: (none — first change of the batch)
- Conflict note: this change rewrites every stylesheet and `hardCodedStrings.test.tsx`; every other change in the batch must be applied after it.
