# Tasks: show-convert-translate

Read `design.md` first; every "D<n>" below refers to it. Prerequisites: `editorial-visual-foundation` and `redesign-match-sources` are applied. Do not edit anything under `src-tauri/`, `src/types/bindings.ts`, `src/features/match/`, `src/features/sync/`, `src/features/settings/`, or the shared components themselves.

## 1. Spec sync

- [ ] 1.1 Validate the deltas without syncing them: `openspec/specs/` is left untouched, because the delta requirement IDs only exist after archive sync. Verify: `openspec validate show-convert-translate --strict` passes and `npm run spec:trace -- --report` still reports the existing convert and translate scenarios as verified. The tests for the eleven new scenarios (six convert, five translate) are written unannotated below; archive syncs the specs and annotates them post-sync. Never hand-build or borrow an ID.

## 2. Convert

- [x] 2.1 Add `src/features/convert/planLines.ts` and `planLines.test.ts` per D2 (cases: keep on, keep off, excluded). Verify: `npx vitest run src/features/convert/planLines.test.ts` passes.
- [x] 2.2 Rewrite `ConvertSourcesStep.tsx` per D1 (and its stylesheet, including the mask override), rename `removeSource` → `removeSources` in `useConvertWizard.ts`, and wire it in `ConvertWizard.tsx`; in the same task rename the prop in the `ConvertSourcesStep` entry of `SCREENS` in `src/i18n/hardCodedStrings.test.tsx` and in its view in `scripts/preview/views.tsx`, which `tsc` also checks. Verify: `npx tsc --noEmit` passes.
- [x] 2.3 Update `ConvertOptionsStep.tsx` per D3 and `ConvertRunStep.tsx` per D4 (plus their stylesheets and the `ConvertWizard.tsx` props), passing the new `ConvertRunStep` props in its `SCREENS` entry and preview view in the same task. Delete the `convert.json` keys of D5 from both locales after the grep check. Verify: `npx tsc --noEmit` and `npx vitest run src/i18n/localeParity.test.ts` pass.
- [x] 2.4 In `src/features/convert/ConvertWizard.test.tsx` add one unannotated test per new convert scenario: drop zone has `[data-kind]` items `folder`, `subtitle`, `archive`, none `video`, and the description text is inside a `visually-hidden` element; removing a folder group leaves the other source listed and the mocked `list_convert_inputs` is last called with exactly that path; keep on → the item's lines have `data-kind` `kept` and `created` with the output path; keep off → `removed` and `created`; an excluded item has one `kept` line, its localized reason, and no `created` line; the run step with two of three selected and keep off lists two items each with `removed` and `created`. Update existing queries that used removed text; every existing `@covers` line stays. Verify: `npx vitest run src/features/convert` passes.

## 3. Translate

- [x] 3.1 Add `src/features/translate/planLines.ts` and `planLines.test.ts` per D2 (cases: suffix, replace, excluded). Verify: `npx vitest run src/features/translate/planLines.test.ts` passes.
- [x] 3.2 Rewrite `TranslateSourcesStep.tsx` per D1 (keeping the files-found list with cue counts), rename `removeSource` → `removeSources` in `useTranslateWizard.ts`, wire it in `TranslateWizard.tsx` (renaming the prop in the `TranslateSourcesStep` `SCREENS` entry and preview view in the same task), update `TranslateOptionsStep.tsx` per D3, and delete the `translate.json` keys of D5 from both locales after the grep check. Verify: `npx tsc --noEmit` and `npx vitest run src/i18n/localeParity.test.ts` pass.
- [ ] 3.3 In `src/features/translate/TranslateWizard.test.tsx` add one unannotated test per new translate scenario: drop zone kinds as in 2.4; removing a folder group leaves the other source and the mocked `list_translate_inputs` is last called with exactly that path; suffix → `kept` + `created`; replace → `removed` + `created`; excluded → one `kept` line, the localized reason, no `created` line. Update existing queries that used removed text; every existing `@covers` line stays. Verify: `npx vitest run src/features/translate` passes.

## 4. Gates, preview, and human review

- [ ] 4.1 Update `src/i18n/hardCodedStrings.test.tsx` per D6. Verify: `npx vitest run src/i18n src/styles src/features/actionPlacement.test.tsx` passes.
- [ ] 4.2 Add the four preview views per D7. Verify: `npx tsc --noEmit` passes.
- [ ] 4.3 With `npm run dev` running, use the `agent-browser` skill (throwaway headless Chromium only; never attach to an existing browser; `agent-browser close` when done) to open each view in both themes (`agent-browser set media light` / `dark`) and both languages, including `convert-options?keep=0` and `translate-options?mode=replace`; save screenshots under the scratch directory and fill in `visual-review.md`. Verify: every row of `visual-review.md` has an observation and a screenshot path.

## 5. Integration

- [ ] 5.1 Run `npm run verify`. Verify: it exits 0, `npm run spec:trace` reports 0 unverified scenarios and 0 dangling annotations (the delta scenarios are not yet in `openspec/specs/`, so they are not counted until archive), and frontend coverage stays at or above 85 % on every metric (close any gap with tests, not exclusions).

## Workflow follow-up

- Owner reviews and signs `visual-review.md`.
- Archive with `openspec archive show-convert-translate` (it syncs the deltas, then annotates the new scenario tests listed in the apply hand-off).
