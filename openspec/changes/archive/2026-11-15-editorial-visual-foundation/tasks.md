# Tasks: editorial-visual-foundation

Read `design.md` first; every "D<n>" below refers to it. Do not edit anything under `src-tauri/`. Do not restructure wizard steps or the Settings screen (design Non-Goals).

## 1. Spec sync

- [ ] 1.1 Sync this change's four deltas into `openspec/specs/theme-system/spec.md` (rename the identity requirement, replace its block, add "Bundled serif typeface", and replace the `## Purpose` paragraph with the exact text in D10), `openspec/specs/app-shell/spec.md` (replace the two modified requirement blocks — navigation and AppHeader —, delete the removed hub requirement, add the home-task-list and stepper requirements), `openspec/specs/build-identity/spec.md` (replace the badge requirement block), and `openspec/specs/app-icon/spec.md` (delete the palette requirement, add the brand-constants requirement; D12). Verify with `openspec validate editorial-visual-foundation --strict` (passes) and `npm run spec:trace -- --report | grep -c "\[ \]"` printing the new unverified scenarios — note their exact IDs for the `@covers` lines below; never hand-build an ID.

## 2. Tokens and stylesheet mechanism tests

- [x] 2.1 Replace `src/styles/tokens.css` with the token set in D1, verbatim. Verify: the file contains none of the legacy names listed in D2's left column, and `grep -c -- "--space-3:\|--control-height-lg:\|--motion-fast:\|--ease-out:" src/styles/tokens.css` prints `4`.
- [x] 2.2 Rewrite `src/styles/tokens.contrast.test.ts` per D3 item 1 (check table exactly as given, opaque-hex and same-names test, old gradient helpers removed) and re-point its `@covers` line to the renamed requirement's "Both themes render every shell screen" ID. Update `src/styles/tokens.colorLiteral.test.ts` per D3 item 2 with `@covers` for "Colours are declared only in the token file". Verify: `npx vitest run src/styles/tokens.contrast.test.ts src/styles/tokens.colorLiteral.test.ts` — contrast passes; colorLiteral may still fail on unswept files until 2.5.
- [x] 2.3 Add `src/styles/tokens.reference.test.ts` per D3 item 3 with `@covers` for "Every referenced token is declared". Verify: it runs and lists the legacy references still to sweep (expected to fail until 2.5).
- [x] 2.4 Add `src/styles/flatness.test.ts` per D3 item 4 with `@covers` for "No glass, gradient, glow, or shadow", "Corners are square", and "Primary buttons are ink-filled" on the respective tests. Verify: it runs (expected to fail until 2.5 and 4.1).
- [x] 2.5 Sweep every stylesheet under `src/` onto the new tokens using D2's mapping and container rules, one directory at a time in this order — `src/styles/`, `src/components/`, `src/features/home/`, `match/`, `convert/`, `translate/`, `sync/`, `settings/` — re-running `npx vitest run src/styles/tokens.reference.test.ts` after each to watch the offender list shrink; update `global.css` (body `color: var(--ink); background-color: var(--paper)`, no background image, focus outline `2px solid var(--accent)`, delete `.gradient-text`). Do not change any TSX in this task. Verify: `npx vitest run src/styles/tokens.reference.test.ts src/styles/tokens.colorLiteral.test.ts` passes and the first two tests of `flatness.test.ts` pass.
- [x] 2.6 Implement D12 in `scripts/app-icon.test.ts` (no change to `assets/brand/` or `src-tauri/icons/`). Verify: `npx vitest run scripts/app-icon.test.ts` passes and `npm run icons:check` reports the icons in sync.

## 3. Bundled serif

- [x] 3.1 Obtain the TTF and `OFL.txt`, convert to WOFF2, and commit the three files under `src/assets/fonts/` exactly as D4 describes, with the measured TTF and WOFF2 byte sizes and SHA-256 digests recorded in `src/assets/fonts/README.md`. Verify: `ls -l src/assets/fonts/` shows the three files and the README's WOFF2 size equals `stat -c %s src/assets/fonts/UoqMunThenKhung-Regular.woff2`. If the download or conversion is impossible, stop and report.
- [x] 3.2 Add `src/styles/fonts.css` and the single serif rule in `global.css` (D4), import `fonts.css` from `global.css` directly after `tokens.css`, and delete `font-weight` / `font-style` from every rule that targets `h1`–`h3`. Verify: `npm run build` succeeds and `dist/assets/` contains a `.woff2` file.
- [x] 3.3 Add devDependency `fontkit` (`npm install --save-dev fontkit`, plus `@types/fontkit` only if `tsc --noEmit` needs it) and write `src/styles/fontCoverage.test.ts` per D4 with `@covers` for "Every locale string is covered", "Serif is served from the application bundle", and "Serif is regular weight without synthesis" on the respective tests. Verify: `npx vitest run src/styles/fontCoverage.test.ts` passes, including the self-check that `U+10FFFF` is reported uncovered.

## 4. Buttons

- [x] 4.1 Create `src/styles/buttons.css` with the rules in D5, verbatim, import it from `global.css` after `fonts.css`, and apply the class changes in D5's table, deleting the superseded visual declarations from each feature stylesheet. Verify: `npx vitest run src/styles/flatness.test.ts src/components/WizardShell src/features/actionPlacement.test.tsx` passes, and `npx vitest run src/styles/layout.test.ts -t "wizard action bar"` passes (the header test in that file is updated in 5.2).

## 5. Title-bar breadcrumb

- [x] 5.1 Implement D6 in `AppHeader.tsx`, `AppHeader.css`, and `App.tsx`; delete `src/components/icons/SettingsIcon.tsx`; delete `common.tagline` and add `common.breadcrumb` in `src/locales/en/common.json` and `src/locales/zh-TW/common.json`. Verify: `npx vitest run src/i18n/localeParity.test.ts` passes.
- [x] 5.2 Update `src/components/AppHeader/AppHeader.test.tsx` and `src/App.test.tsx` for the breadcrumb (existing `@covers` IDs for the navigation, header, and badge scenarios are unchanged and must stay; re-point the `App.test.tsx` "First launch shows the hub" annotation to the new "Desktop application launches with the home task list" requirement's ID), and add to `src/App.test.tsx` a test with `@covers` for "Breadcrumb names the current screen": on the hub no element has `aria-current="page"`; after opening Match and after opening Settings the `aria-current="page"` element holds that screen's localized title and is not a button. Update the "app header build identity" test in `src/styles/layout.test.ts` per D6. Verify: `npx vitest run src/components/AppHeader src/App.test.tsx src/styles/layout.test.ts` passes.

## 6. Stepper

- [x] 6.1 Implement D7 in `WizardShell.tsx` and `WizardShell.css`. In `src/components/WizardShell/WizardShell.test.tsx` add two tests with `@covers` for "Ordinals stay visible in every state" (three steps, middle active: markers read `01`, `02`, `03`) and "Step counter is announced but not shown" (the localized counter text is in the document and its element has class `visually-hidden`); adjust the existing counter/marker assertions. Verify: `npx vitest run src/components/WizardShell` passes.

## 7. Home list

- [x] 7.1 Implement D8: create `TaskRow` (with `TaskRow.css`), `specimens.ts`, `TaskSpecimen.tsx`; rewrite `HomeScreen.tsx` and `HomeScreen.css`; delete `src/components/TaskCard/` and `src/components/icons/TaskIcons.tsx`; delete `home.subheading` and add `home.specimens.translate.source` / `.target` in both locales. Verify: `npx tsc --noEmit` passes.
- [x] 7.2 Tests: create `src/components/TaskRow/TaskRow.test.tsx` (enabled row calls `onSelect`; disabled row shows the coming-soon badge and does not call it — carries `@covers` for the new requirement's "Unimplemented features are visibly disabled" ID, replacing the test in the deleted `TaskCard.test.tsx`). In `src/features/home/HomeScreen.test.tsx` re-point the "First launch shows the hub" `@covers` to the new requirement's ID, and add tests with `@covers` for "Tasks form one numbered list" (one `list` with four `listitem`s, each with exactly one button, names in order Match, Convert, Sync, Translate) and "Each entry demonstrates its task with a specimen" (each row has a `.task-row__specimen[aria-hidden="true"]`, and each button `toHaveAccessibleDescription` of its localized description). Remove the three home-grid tests from `src/styles/layout.test.ts`. Extend `ALLOWED` in `src/i18n/hardCodedStrings.test.tsx` from `SPECIMEN_TEXTS` per D8. Verify: `npx vitest run src/features/home src/components/TaskRow src/App.test.tsx src/i18n src/styles` passes.

## 8. Preview harness and human review

- [x] 8.1 Create `scripts/preview/index.html`, `main.tsx`, and `views.tsx` per D9 with the `app` view and one view per step component. Verify: `npx tsc --noEmit` passes and, with `npm run dev` running, `curl -s "http://localhost:1420/scripts/preview/index.html" | grep -c main.tsx` prints `1`.
- [x] 8.2 With `npm run dev` running, use the `agent-browser` skill (throwaway headless Chromium only; never attach to an existing browser; `agent-browser close` when done) to open `http://localhost:1420/` and each preview view in both themes (`agent-browser set media light` / `dark`, or `?theme=`) and both languages, save screenshots under the scratch directory, and fill in every row of `visual-review.md` (including the measured WOFF2 size from 3.1). Verify: `visual-review.md` has no empty "Observed" cell and lists a screenshot path per row; anything that does not match the design document is written down there, not silently fixed outside this change's scope.

## 9. Integration

- [ ] 9.1 Run `npm run verify`. Verify: it exits 0, `npm run spec:trace` reports 0 unverified scenarios and 0 dangling annotations, and frontend coverage stays at or above 85 % on every metric (close any gap with tests, not exclusions).

## Workflow follow-up

- Owner reviews and signs `visual-review.md`.
- Archive with `openspec archive editorial-visual-foundation --skip-specs` (specs were synced in 1.1). Task 1.1 was deferred to archive during apply (the traceability workflow syncs and re-points annotations post-sync), so archive without `--skip-specs` unless 1.1 has been done by then.
