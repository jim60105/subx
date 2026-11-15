# Proposal: redesign-match-analysis-execute

## Why

The match wizard's analysis step shows three text labels and a sentence asking the user to wait, and its execute step shows one summary sentence before running and a status word per file afterwards. The approved editorial redesign (`docs/superpowers/specs/2026-11-15-editorial-redesign-design.md`, "02 Analysis" and "04 Execute") replaces both with designs that show what is happening — without claiming more than the backend actually reports.

Third of three changes delivering the design document's "Match wizard redesign" (split because the whole item clearly exceeds one workday; see Batch).

## What Changes

- Analysis: three serif stage words track the real `MatchStage`; beneath them an illustrative animation (film-strip bars for videos, subtitle bars, dashed accent curves trying pairings, ink curves for settled pairs, unpaired bars dimming). Because `MatchProgress` carries only the stage, the illustration is decorative: no percentage, no file names, a fixed number of shapes, and only the two scan totals as data. The "this can take a moment" sentence is removed.
- Execute, before running: every selected operation is listed as `old name → new name` under a large count and the relocation mode.
- Execute, running: an accent bar sweeps along a rule above the list and the list breathes. `ExecutionReportDto` is returned once, so no per-row progress is shown.
- Execute, done: rows resolve top to bottom on a short stagger — success strikes the old name, colours the new name as created, and shows a check; failure shows its error beneath the row. Large numerals show the success and failure totals.
- `prefers-reduced-motion`: the analysis illustration renders statically and identically in every stage (only the active stage word changes); the execute step shows its final state at once. A small hook exposes the preference to components that schedule timers, and the global reduced-motion rule also zeroes delays.
- Locale keys made redundant are deleted from both `en` and `zh-TW`; new keys are added to both; the three stage labels are shortened.

Human-reviewed, not specified: the look, pacing, and feel of both animations, in both themes and with reduced motion emulated, are judged by the owner using `visual-review.md` in this change directory, from `agent-browser` recordings and screenshots.

No backend or IPC change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `match-workflow`: three requirements are added — the analysis illustration never claims progress; the execute step lists every selected operation before running; the execute step resolves each row from the single report. "Cancellable AI analysis with staged progress" and "Execution with per-item report" are unchanged.

## Impact

- New: `src/theme/usePrefersReducedMotion.ts`, `src/features/match/AnalysisIllustration.tsx` and `.css`, `src/features/match/executeRows.ts`, each with tests; `AnalysisStep.test.tsx`, `ExecuteStep.test.tsx`.
- Modified: `src/features/match/AnalysisStep.tsx` and `.css`, `ExecuteStep.tsx` and `.css`, `MatchWizard.tsx`, `useMatchWizard.ts` (execution ids sent in ascending order), `MatchWizard.test.tsx`; `src/styles/tokens.css` (two motion tokens), `src/styles/global.css` (reduced-motion delays), `src/styles/layout.test.ts`; `src/test/matchMedia.ts`; `src/locales/{en,zh-TW}/match.json`; `src/i18n/hardCodedStrings.test.tsx`; `scripts/preview/views.tsx`.
- No new dependency. No change under `src-tauri/`.

## Batch: editorial-redesign

- depends-on: editorial-visual-foundation
- depends-on: redesign-match-sources
- depends-on: redesign-match-review
- Conflict note: shares `MatchWizard.tsx`, `useMatchWizard.ts`, `match.json`, `MatchWizard.test.tsx`, `hardCodedStrings.test.tsx`, `layout.test.ts`, and `scripts/preview/views.tsx` with the two earlier match changes; apply strictly after them. It uses `DiffLine` and `baseName` from `redesign-match-sources`. No later change in the batch depends on this one.
