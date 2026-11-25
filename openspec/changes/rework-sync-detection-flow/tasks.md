# Tasks

Boundaries: edit only the files named below. `OffsetField`, `OffsetPreview`, `SyncApplyStep`, `SyncInputsStep` and all of `src-tauri/` are not touched. Existing `// @covers` lines stay with their updated tests; new scenarios stay unannotated until archive.

## 1. State

- [ ] 1.1 Implement design D1 in `useSyncWizard.ts`. In `useSyncWizard.test.ts` add `renderHook` tests (mocking `./syncWizardApi`) for "Failed or cancelled detection keeps the offset", "Changing a file resets the review" (both files, removal, and same path resets nothing), and for a start after cancel waiting for the pending cancel promise. Verify: `npx vitest run src/features/sync/useSyncWizard.test.ts`.

## 2. Screens

- [ ] 2.1 Apply D4 to `src/locales/{en,zh-TW}/sync.json` and `errors.json`. Verify: `npx vitest run src/i18n/localeParity.test.ts src/i18n/backendCodeParity.test.ts src/styles/fontCoverage.test.ts`.
- [ ] 2.2 Implement D3. In `SyncDetectStep.test.tsx` keep the elapsed-time tests on the new props, move the slider test with its `@covers` line from `SyncMethodStep.test.tsx`, and add tests for "Detecting shows elapsed time and cancel" (component half: status, no `progressbar` role, `aria-hidden` instrument). Add the "Waiting illustration honours reduced motion" assertion to `src/styles/layout.test.ts`, following its "translate batch bar" test. Verify: `npx vitest run src/features/sync/SyncDetectStep.test.tsx src/styles`.
- [ ] 2.3 Implement D2 in `SyncWizard.tsx` and the `WizardShell.tsx` comment. Update `SyncWizard.test.tsx`: helpers `reachDetect` and `reachOffset` replace `reachMethod` and `reachReview`; every existing scenario test keeps its `@covers` line and asserts the MODIFIED text. Add tests for "Drops outside the files step are ignored", "Configured manual method makes skipping primary" (both values, slots asserted through `.wizard__actions`), "Detected offset beyond the maximum can be reduced", "Failure offers retry and skip", "Skip resets the offset", "Back from save keeps the review", and the action-bar half of "Detecting shows elapsed time and cancel". Verify: `npx vitest run src/features/sync`.
- [ ] 2.4 Update `src/features/actionPlacement.test.tsx` (`syncToApply` goes Continue → Skip → Continue), `src/i18n/hardCodedStrings.test.tsx` (replace `SyncMethodStep` and `SyncDetectStep` entries with `SyncDetectStep` ask/detecting/failed and `SyncOffsetStep`), and `scripts/preview/views.tsx`: remove the `SyncMethodStep` import, `SyncMethodView`, and the `sync-method` and `SyncMethodStep` entries of `VIEWS`; add `sync-detect` (`?phase=`, `?media=0`); give the `SyncDetectStep` entry the new props. Verify: `npx vitest run src/features/actionPlacement.test.tsx src/i18n` and `npx tsc --noEmit`.

## 3. Documentation and integration

- [ ] 3.1 Update the sync sentence in `README.md` (detect or skip, then adjust) and append to the existing `### Changed` under `[Unreleased]` in `CHANGELOG.md`. Verify: `grep -n "Sync" README.md CHANGELOG.md`.
- [ ] 3.2 Run `openspec validate rework-sync-detection-flow --strict` and `npm run verify`. Expected: both exit 0, 0 unverified scenarios, 0 dangling annotations.
- [ ] 3.3 With `agent-browser` fill "Observed" in `visual-review.md`. Verify: every row has an observation.

## Workflow follow-up

- At archive, after `openspec archive rework-sync-detection-flow --yes`, add `// @covers` lines to the new tests with the ids from `npm run spec:trace -- --report`.
- Owner fills "Verdict" in `visual-review.md`.
