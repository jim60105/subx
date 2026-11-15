# Tasks: redesign-match-analysis-execute

Read `design.md` first; every "D<n>" below refers to it. Prerequisites: `editorial-visual-foundation`, `redesign-match-sources`, and `redesign-match-review` are applied. Do not edit anything under `src-tauri/` or `src/types/bindings.ts`, and do not change the sources or review steps or the action-bar flow in `MatchWizard.tsx`.

## 1. Spec sync

- [ ] 1.1 Append the three ADDED requirements to `openspec/specs/match-workflow/spec.md`. Verify: `openspec validate redesign-match-analysis-execute --strict` passes and `npm run spec:trace -- --report` lists the eleven new scenarios (four analysis, two execute-list, five execute-outcome) as unverified — copy their exact IDs for the `@covers` lines below; never hand-build an ID.

## 2. Motion foundation

- [ ] 2.1 Add the two tokens and replace the reduced-motion block per D1. In `src/styles/layout.test.ts` add a "reduced motion" test asserting that the `@media (prefers-reduced-motion: reduce)` block of `global.css` declares `animation-delay: 0s !important` and `transition-delay: 0s !important` (plus the three existing declarations), carrying `@covers` for "Reduced motion reveals the final state at once". Verify: `npx vitest run src/styles` passes.
- [ ] 2.2 Extend `src/test/matchMedia.ts` and add `src/theme/usePrefersReducedMotion.ts` with `usePrefersReducedMotion.test.tsx` per D2. Verify: `npx vitest run src/theme` passes, including the existing `themeController.test.tsx` unchanged.

## 3. Analysis step

- [ ] 3.1 Apply D5's `analysis.*` value changes and the `analysis.description` deletion to both locales. Create `AnalysisIllustration.tsx` and `AnalysisIllustration.css` per D3 and rewrite `AnalysisStep.tsx` / `AnalysisStep.css` per D3; pass `scan` from `MatchWizard.tsx`. Verify: `npx tsc --noEmit` and `npx vitest run src/i18n/localeParity.test.ts` pass.
- [ ] 3.2 Create `src/features/match/AnalysisStep.test.tsx` with one test per analysis scenario, each with its `@covers` line: "Illustration carries no progress semantics" (for each of the three stages: the `svg.analysis-loom` has `aria-hidden="true"`, `queryByRole("progressbar")` is null, and the step's text content contains no `%`); "Illustration size is independent of the scan" (counts of `.analysis-loom__video` and `.analysis-loom__subtitle` are equal for scans 3/5 and 300/500 and equal `VIDEO_BARS` / `SUBTITLE_BARS`); "Scan totals are the only data shown" (both totals appear with their localized nouns, and the svg's `textContent` is empty); "Reduced motion renders a static illustration" (with `setPrefersReducedMotion(true)` and `vi.useFakeTimers()`: the svg's `outerHTML` is identical for `scanning`, `analyzing`, `finalizing`; `vi.getTimerCount()` is 0; the `aria-current="step"` item follows the stage). Add two un-annotated tests for the animated path: in `analyzing`, advancing fake timers by `LOOM_CYCLE_MS` increments `data-cycle`; unmounting leaves `vi.getTimerCount()` at 0. Update the existing "Stages are reflected" test in `MatchWizard.test.tsx` only where it queried the old label text; its `@covers` line stays. Verify: `npx vitest run src/features/match/AnalysisStep.test.tsx src/features/match/MatchWizard.test.tsx` passes.

## 4. Execute step

- [ ] 4.1 Add `src/features/match/executeRows.ts` per D4 and `executeRows.test.ts` covering: only selected operations, in plan order; `newName` is the base name of `targetPath`; with selected ids `{5, 2}` and a two-outcome report, id 2 gets `outcomes[0]` and id 5 gets `outcomes[1]`; a report whose length differs from the selection yields one row per outcome in report order. Verify: `npx vitest run src/features/match/executeRows.test.ts` passes.
- [ ] 4.2 Apply D5's `execute.*` additions and deletions to both locales. Rewrite `ExecuteStep.tsx` and `ExecuteStep.css` per D4, update the `ExecuteStep` call in `MatchWizard.tsx`, and sort the ids in `useMatchWizard.execute`. Verify: `npx tsc --noEmit` and `npx vitest run src/i18n/localeParity.test.ts` pass.
- [ ] 4.3 Create `src/features/match/ExecuteStep.test.tsx` with one test per execute scenario, each with its `@covers` line: "Selected operations are listed before running" (two of three selected: the figure is 2 with the localized mode, exactly two rows in plan order, each containing the subtitle name and the base name of its target path); "Deselected operations are absent"; "Running shows no per-row outcome" (`isExecuting`, no report: an element with role `progressbar` exists without `aria-valuenow`, every row has `data-status="pending"`, and no row contains `✓` or `✕`); "A successful row resolves as removed and created" (the row has `[data-kind="removed"]` with the old name, `[data-kind="created"]` with the new name, and the localized success text); "A failed row shows its error beneath it" (`data-status="failed"`, the localized message for the error code is inside that row, and a sibling successful row is still `ok`); "Totals count successes and failures" (figures 2 and 1 under `data-result`, and the pre-run summary label is gone). Add a second `@covers` for "Reduced motion reveals the final state at once" on a test proving that, with a report, every row has a non-pending `data-status` synchronously after render with no timer pending. Update the execute-related tests in `MatchWizard.test.tsx` for the new markup; existing `@covers` lines stay. Verify: `npx vitest run src/features/match` passes.
- [ ] 4.4 Update `src/i18n/hardCodedStrings.test.tsx` per D6. Verify: `npx vitest run src/i18n src/styles` passes (including `tokens.reference.test.ts` and `flatness.test.ts`).

## 5. Preview and human review

- [ ] 5.1 Add the `match-analysis` and `match-execute` views per D7. Verify: `npx tsc --noEmit` passes.
- [ ] 5.2 With `npm run dev` running, use the `agent-browser` skill with a throwaway headless Chromium only (never attach to an existing browser; `agent-browser close` when done). For each of `match-analysis` and `match-execute`: (a) `agent-browser set media light`, open the view, and take screenshots at several moments of the animation (analysis: during scanning, mid-analyzing, finalizing; execute: idle, running, mid-reveal, done); (b) repeat with `agent-browser set media dark`; (c) repeat with `agent-browser set media light reduced-motion` and `agent-browser set media dark reduced-motion`, and confirm with `agent-browser eval "document.getAnimations().filter(a => a.playState === 'running').length"` printing `0` a second after load, that the analysis svg has `data-motion="static"`, and that the execute `done` phase shows every outcome immediately. Save everything under the scratch directory and fill in `visual-review.md`. Verify: every row of `visual-review.md` has an observation and a screenshot path for light, dark, and reduced motion.

## 6. Integration

- [ ] 6.1 Run `npm run verify`. Verify: it exits 0, `npm run spec:trace` reports 0 unverified scenarios and 0 dangling annotations, and frontend coverage stays at or above 85 % on every metric (close any gap with tests, not exclusions).

## Workflow follow-up

- Owner reviews and signs `visual-review.md`.
- Archive with `openspec archive redesign-match-analysis-execute --skip-specs` (specs were synced in 1.1).
