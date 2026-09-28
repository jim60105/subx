# Tasks: add-language-quick-select

## 1. Backend language attachment

- [x] 1.1 Add `language: Option<String>` to `MatchOperationDto` in `src-tauri/src/dto.rs` (doc comment naming `LanguageDetector` as its source) and fill it in the plan builder in `src-tauri/src/commands/match.rs` via `LanguageDetector::get_primary_language(&op.subtitle_file.path)`; verify by asserting in the existing plan-builder tests (`two_subtitles_group_under_one_video` and a new case) that `show.tc.srt` yields `Some("tc")`, `show.en.srt` yields `Some("en")`, and an unmatchable name yields `None` — pinning at most one code per operation — and run `npm run test:rust`.

- [x] 1.2 Regenerate `src/types/bindings.ts` with `npm run bindings:generate` and verify `npm run bindings:check` and `ipcBoundary.test.ts` pass with the new `language: string | null` field (no `ipc_tests` fixture change is needed for the optional field).

## 2. Frontend quick-select

- [x] 2.1 Add a pure grouping helper in `src/features/match/` that maps a `MatchPlanDto` to language groups (first-appearance order of distinct codes, `null` operations gathered into one synthetic `Other` group placed last) and verify it with direct unit tests covering: only-present languages get groups, operations under one code group together regardless of video, `null`-only plans yield exactly the `Other` group, and every operation id appears in exactly one group.

- [x] 2.2 Add `toggleLanguageSelection(ids: number[])` to `useMatchWizard.ts` implementing design D4 (all of `ids` selected → remove them; otherwise → add them all) over `selectedIds`, and verify with a focused test that `selectedCount` tracks the set after select-all and clear-all on a group.

- [x] 2.3 Render the quick-select chip bar in `ReviewStep.tsx` per design D2/D3/D5 (one chip per group with `match.review.languages.<code>` name and count, `defaultValue: code` fallback, `role="checkbox"` + `aria-checked` incl. `"mixed"`, explicit per-chip `aria-label` key, hidden only when the plan has no operations), add the `onToggleLanguage` prop to `ReviewStepProps` and wire it in `MatchWizard.tsx` to `wizard.toggleLanguageSelection`, and style in `ReviewStep.css` using only `var(--token)` values; verify via a `ReviewStep` render test that a mixed group reports `aria-checked="mixed"`.

## 3. Localization and traceability

- [x] 3.1 Add the new `match.review` keys (bar label, per-chip accessible-name key, `Other`, and names for all ten detector codes `tc`/`sc`/`en`/`ja`/`ko`/`fr`/`de`/`es`/`pt`/`ru`) to `src/locales/en/match.json` and `src/locales/zh-TW/match.json`; update the `hardCodedStrings.test.tsx` ReviewStep entry to render a small populated plan (a few rows with distinct `language` values incl. one `null`) plus the new prop, so the chip bar actually reaches the DOM; verify `localeParity.test.ts` and `hardCodedStrings.test.tsx` pass for the review screen in both `cimode` and `zh-TW`.

- [x] 3.2 Extend the `MatchWizard.test.tsx` PLAN fixture so operations cover at least: one language with 2+ members, a group that can reach mixed selection, and one `null`-language operation; add vitest cases for each delta scenario — chips show each present group's localized name and count only for present languages, activating a partially- or fully-cleared group selects all of it, activating a fully-selected group clears only it, chips track manual row unchecks, an all-`null` plan shows a single `Other` control, and clearing the last selected group via chips disables Continue until a chip click re-selects from zero (with the chip reading cleared at zero); tag each with `// @covers match-workflow/language-quick-select-on-review#<scenario-slug>` using IDs derived from `npm run spec:trace -- --report` after task 4.1's sync (never hand-built), and verify `npx vitest run src/features/match` is green.

## 4. Spec sync and integration verification

- [x] 4.1 Sync the delta requirement into `openspec/specs/match-workflow/spec.md` (the sync the archive step would otherwise do; archive later uses `openspec archive --skip-specs` per repo precedent) and verify `npm run spec:trace` reports every new scenario verified and zero dangling annotations.

- [x] 4.2 Run the full repo check set (`npm run verify`) and confirm no regressions in the match-wizard, translate-wizard, boundary, locale-parity, and spec-trace suites.
