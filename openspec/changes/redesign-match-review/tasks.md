# Tasks: redesign-match-review

Read `design.md` first; every "D<n>" below refers to it. Prerequisites: `editorial-visual-foundation` and `redesign-match-sources` are applied. Do not edit anything under `src-tauri/` or `src/types/bindings.ts`, and do not touch the sources, analysis, or execute steps.

## 1. Spec sync

- [ ] 1.1 Validate the deltas without syncing them: `openspec/specs/` is left untouched, because the delta requirement IDs only exist after archive sync. Verify: `openspec validate redesign-match-review --strict` passes; `npm run spec:trace -- --report` shows the two pre-existing review scenarios still verified by their Rust tests. The tests for the twelve new scenarios (five review, four filter, one count, two note) are written unannotated below; archive syncs the specs and annotates them post-sync. Never hand-build or borrow an ID.

## 2. Ledger derivation

- [x] 2.1 Add `src/features/match/reviewLedger.ts` per D1 and `src/features/match/reviewLedger.test.ts` covering: order equals plan order for confidences 96/52/98; `low` is true at 79 and false at 80; `showVideoName` is true for a video's first pairing and false for its second; `filterLedger(rows, "needsReview")` on a plan whose only low pairing is a video's second pairing returns it with `showVideoName: true`; `filterLedger(rows, "unmatched")` returns only unmatched rows; `ledgerCounts` for a plan with 3 pairings (1 low), 1 unmatched video, 1 unmatched subtitle is `{ all: 3, needsReview: 1, unmatched: 2 }`; `meterSegments` of 0, 52, and 100 is 0, 3, and 5. Verify: `npx vitest run src/features/match/reviewLedger.test.ts` passes.

## 3. WizardShell status note

- [x] 3.1 Implement D4 in `WizardShell.tsx` and `WizardShell.css`. In `WizardShell.test.tsx` add two unannotated tests for "A note renders beside the primary action" (the `status` element is inside `.wizard__actions-end`, is the previous element sibling of the primary button, contains no button, has `tabIndex` unset, and exposes the supplied label text) and "No note leaves the action bar unchanged" (`queryByRole("status")` inside the action bar is null). Verify: `npx vitest run src/components/WizardShell src/styles/layout.test.ts src/features/actionPlacement.test.tsx` passes.

## 4. Review step

- [ ] 4.1 Apply D5's additions and deletions to `src/locales/en/match.json` and `src/locales/zh-TW/match.json`. Verify: `npx vitest run src/i18n/localeParity.test.ts` passes.
- [ ] 4.2 Rewrite `ReviewStep.tsx` per D2 and `ReviewStep.css` per D3 (props unchanged), and set `next.note` in `MatchWizard.tsx`'s review branch per D4. Verify: `npx tsc --noEmit` passes.
- [ ] 4.3 In `src/features/match/ReviewStep.test.tsx` add one unannotated test per new scenario: "Rows keep plan order regardless of confidence" (subtitle names of the `[data-kind="pair"]` rows equal plan order for 96/52/98); "A repeated video name is omitted" (second row's video cell has the name only inside `.visually-hidden`); "Confidence is shown only below the threshold" (the 79 row has `data-low="true"`, a `.review-ledger__meter`, the localized figure, and its reasoning text visible outside any `details`; the 80 row has none of the three); "Reasoning of a confident row is available on demand" (reasoning is inside a closed `details`, and opening it shows the exact string); "Unmatched entries show an empty slot on the missing side" (both rows come after every pair row, contain no checkbox, and contain an `img` named by `review.noSubtitle` / `review.noVideo`); "Filter counts describe the whole plan"; "Needs-review filter shows only low-confidence pairings" (and the visible row displays its video name); "Unmatched filter shows only unmatched entries". Keep the two existing language quick-select tests passing. Verify: `npx vitest run src/features/match/ReviewStep.test.tsx` passes.
- [ ] 4.4 In `src/features/match/MatchWizard.test.tsx` add unannotated tests for "Filtering does not change selection" (reach review with all selected, press the needs-review filter, the note still reads all-of-all, press Continue then Apply, and the mocked `execute_selected` receives every operation id) and "Count follows the selection" (three operations: the status reads `3 / 3` and the localized "3 of 3 selected"; after unchecking one it reads `2 / 3` and "2 of 3 selected"). Update existing assertions that referenced the removed description or the two unmatched section headings; every existing `@covers` line stays. In `src/styles/layout.test.ts` add a "match review step" block asserting the declarations marked † in D3. Verify: `npx vitest run src/features/match src/styles/layout.test.ts` passes.
- [ ] 4.5 Update `src/i18n/hardCodedStrings.test.tsx` per D6. Verify: `npx vitest run src/i18n src/styles` passes.

## 5. Preview and human review

- [ ] 5.1 Add the `match-review` view per D7. Verify: `npx tsc --noEmit` passes.
- [ ] 5.2 With `npm run dev` running, use the `agent-browser` skill (throwaway headless Chromium only; never attach to an existing browser; `agent-browser close` when done) to open `?view=match-review` in both themes (`agent-browser set media light` / `dark`) and both languages, at 1100 × 720 and 860 × 600; take screenshots of each filter, of a deselected language chip, and of an opened reasoning disclosure; fill in `visual-review.md`. Verify: every row of `visual-review.md` has an observation and a screenshot path.

## 6. Integration

- [ ] 6.1 Run `npm run verify`. Verify: it exits 0, `npm run spec:trace` reports 0 unverified scenarios and 0 dangling annotations, and frontend coverage stays at or above 85 % on every metric (close any gap with tests, not exclusions).

## Workflow follow-up

- Owner reviews and signs `visual-review.md`.
- Archive with `openspec archive redesign-match-review` (it syncs the deltas, then annotates the new scenario tests listed in the apply hand-off).
