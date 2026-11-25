# Tasks

Boundaries: edit only the files named below; no `src-tauri/`, `usePreviewSession.ts` or wizard state change. Existing `// @covers` lines stay with their updated tests; new scenarios stay unannotated until archive.

## 1. Time rule

- [x] 1.1 Add `visibleCues` per design D1 with tests for both window edges, a cue visible only by its shifted interval, a clamped cue and 2000 cues. Verify: `npx vitest run src/features/sync/cueTiming.test.ts`.
- [x] 1.2 Create `TimeRule.tsx/.css` per D2 with one test per scenario of "Time rule scrolls real cues" except the absence scenario, and the two moved tests ("Preview follows the sign of the offset", "Preview is schematic and hidden from assistive technology") carrying their existing `@covers` lines and asserting the MODIFIED text. Verify: `npx vitest run src/features/sync/TimeRule.test.tsx src/styles`.
- [x] 1.3 Render it in `SyncPlayer.tsx`; test "Rule is absent without playable media or cues" for each state. Verify: `npx vitest run src/features/sync/SyncPlayer.test.tsx`.

## 2. Offset row

- [x] 2.1 Implement D3: delete `OffsetPreview.tsx/.css` and its tests, update `OffsetField.test.tsx` (the nudge test keeps its `@covers` line; accessible names unchanged; add a test that the direction attribute is absent at first, `up` after increase and `down` after decrease), add `offset.nudgeDown/nudgeUp` to both locales. Verify: `npx vitest run src/features/sync src/i18n` and `grep -rn OffsetPreview src scripts` prints nothing.
- [x] 2.2 Implement D4 and add a `src/styles/layout.test.ts` block asserting that the stage has `min-height: 6rem` and `flex: 1 1 0` and that the rule's height is 74px. Update `scripts/preview/views.tsx`. Verify: `npx vitest run src/styles src/features/sync` and `npx tsc --noEmit`.

## 3. Documentation and integration

- [x] 3.1 Update the sync sentence in `README.md` to mention the preview and extend the `[Unreleased]` entry in `CHANGELOG.md`. Verify: `grep -n -i preview README.md CHANGELOG.md`.
- [ ] 3.2 Run `openspec validate add-sync-time-rule --strict` and `npm run verify`. Expected: both exit 0, 0 unverified scenarios, 0 dangling annotations.
- [ ] 3.3 With `agent-browser` fill "Observed" in `visual-review.md`, light and dark at 1100×720 and 860×600. Verify: every row has an observation.

## Workflow follow-up

- At archive, after `openspec archive add-sync-time-rule --yes`, rewrite the three `@covers` ids of the renamed requirement and add the new ones with the ids from `npm run spec:trace -- --report`.
- Owner fills "Verdict" in `visual-review.md`.
