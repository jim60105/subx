# Proposal: redesign-match-review

## Why

The match review step nests three levels — a video heading, its subtitle list, and a target path under each subtitle — which is hard to scan, and it prints a confidence figure on every row although nearly every match is high confidence. The approved editorial redesign (`docs/superpowers/specs/2026-11-15-editorial-redesign-design.md`, "03 Review") replaces it with a one-row-per-pairing ledger that keeps video order and only speaks up about the rows that need a second look.

Second of three changes delivering the design document's "Match wizard redesign" (split because the whole item clearly exceeds one workday; see Batch).

## What Changes

- The review step becomes a ledger: one row per pairing with checkbox, video name, a joining rule, subtitle name with its language tag, and the resulting file name beneath it. A video's second and later pairings omit the repeated video name.
- Rows stay in plan (video) order and are never re-sorted by confidence.
- Confidence is shown only below 80: such a row gets an accent rule at its inline start, a five-segment meter with the figure, and the AI reasoning expanded in place. Other rows expose reasoning on demand.
- Unmatched videos and subtitles move into the same ledger, each with an empty dashed slot on the missing side; the two separate "unmatched" sections are removed.
- A filter row offers All / Needs review / Unmatched with counts. Filters only change which rows are displayed; they never change selection. The existing per-language quick-select chips sit beside the filters and keep their behaviour.
- The action bar shows the selected count as `12 / 14` beside the primary button, through a new optional status note on `WizardShell`'s `next` action. The "Uncheck anything you don't want to apply." sentence is removed.
- Locale keys made redundant are deleted from both `en` and `zh-TW`; new keys are added to both.

Human-reviewed, not specified: visual fidelity to the mockup and scanning comfort of the ledger are judged by the owner using `visual-review.md` in this change directory.

No backend or IPC change: the ledger is a different rendering of the existing `MatchPlanDto`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `match-workflow`: "Review of the match plan grouped by video" is rewritten for the ledger, the below-80 confidence rule, and in-ledger unmatched entries; two requirements are added for the review filters and for the selected count beside the primary action. "Language quick-select on review" and "Checkbox selection of operations" are unchanged.
- `app-shell`: a requirement is added for the optional status note on the wizard's primary action.

## Impact

- New: `src/features/match/reviewLedger.ts` and `reviewLedger.test.ts`.
- Modified: `src/features/match/ReviewStep.tsx`, `ReviewStep.css`, `ReviewStep.test.tsx`, `MatchWizard.tsx`, `MatchWizard.test.tsx`; `src/components/WizardShell/WizardShell.tsx`, `.css`, `.test.tsx`; `src/locales/{en,zh-TW}/match.json`; `src/i18n/hardCodedStrings.test.tsx`; `src/styles/layout.test.ts`; `scripts/preview/views.tsx`.
- No new dependency. No change under `src-tauri/`.

## Batch: editorial-redesign

- depends-on: editorial-visual-foundation
- depends-on: redesign-match-sources
- Conflict note: shares `MatchWizard.tsx`, `match.json`, `MatchWizard.test.tsx`, `hardCodedStrings.test.tsx`, `WizardShell.css`, `layout.test.ts`, and `scripts/preview/views.tsx` with `redesign-match-sources` (before) and `redesign-match-analysis-execute` (after); apply strictly in order. It uses `baseName` from `src/platform/fileKind.ts`, introduced by `redesign-match-sources`.
