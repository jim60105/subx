# Proposal: add-language-quick-select

## Why

Match Review lists every proposed operation with an individual checkbox and everything starts selected, so a user who matched a episode folder holding five or six subtitle languages and only wants one — classically Traditional Chinese, not Simplified — has to untick the unwanted rows one by one. The per-file language is already recoverable from the subtitle's path, so the review step can offer the filter for free instead of making the user click.

## What Changes

- The match Review step gains a language quick-select bar above the operation list: one chip per subtitle language present in the plan (plus an `Other` chip holding the operations whose language the detector could not identify), each showing the language name and its operation count.
- Clicking a chip selects every operation of that language when any of them is unselected, and clears all of them when all are selected — the same tri-state group semantics as the per-video groups it sits beside. Manual per-row checkboxes are untouched and the chips always reflect their language's actual selection state, so chips, rows, and the existing `Execute` disabled-at-zero rule stay in sync.
- `MatchOperationDto` gains an optional `language` code: the thin command layer resolves it from the subtitle file's path via the crate's `LanguageDetector` while building the plan. No new commands, no engine changes, and the filtering itself is frontend-only state over the already-held `selectedIds`.
- `en` and `zh-TW` gain the new `match.review` keys for the chip labels and the quick-select bar's accessible name.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

`match-workflow` gains a new requirement, "Language quick-select on review". The existing "Checkbox selection of operations" requirement is left textually untouched — quick-select only changes which boxes are checked, never the per-row checkboxes themselves nor the disabled-at-zero execution rule — so the delta is an ADDED requirement, not a modification.

## Impact

- Backend (plumbing only): `src-tauri/src/dto.rs` gains `MatchOperationDto::language: Option<String>`; the plan builder in `src-tauri/src/commands/match.rs` fills it via `subx_core::core::language::LanguageDetector`, with a language assertion added to the existing plan-builder tests; `src/types/bindings.ts` regenerated (the optional field needs no `ipc_tests` change — the DTO fixture there is minimal).
- Frontend: `src/features/match/ReviewStep.tsx` (chip bar), `useMatchWizard.ts` (`toggleLanguageSelection` alongside `toggleSelection`), `ReviewStep.css`, new language-code display-name map, `locales/{en,zh-TW}/match.json`, new vitest coverage in `MatchWizard.test.tsx` with `// @covers` tags.
- Tests: the `hardCodedStrings.test.tsx` ReviewStep fixture must render a populated plan so the new chip strings are inside the localization gate, and the delta must be synced into `openspec/specs/match-workflow/spec.md` so the new `@covers` tags resolve.
- No spec changes to the translate/convert/sync wizards; their selection UIs are deliberately not touched (see design).
