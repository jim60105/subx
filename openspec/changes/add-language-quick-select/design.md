# Design: add-language-quick-select

## Context

See `proposal.md` for motivation. The shape of the problem is set by three existing facts:

- The review step (`src/features/match/ReviewStep.tsx`) is presentational: it receives `plan`, `selectedIds: Set<number>`, and `onToggle(id)`; all selection state lives in `useMatchWizard`, and `MatchWizard.tsx` wires them together. The Execute button's disabled state derives from `wizard.selectedCount`.
- `MatchOperationDto` (generated in `src/types/bindings.ts` from `src-tauri/src/dto.rs`) carries `id`, `subtitleName`, `targetPath`, `confidence`, `reasoning` — no language. The frontend never sees the subtitle's source path: `subtitleName` is a bare file name and `targetPath` is the *destination*, so the review UI cannot see the directory context the crate's detector also uses.
- The crate already ships the detection the feature needs: `subx_core::core::language::LanguageDetector::get_primary_language(path)` inspects whole path components and filename infixes (`.tc.`, `_tc.`, `-tc.` — only 2–3 ASCII letters can match from a filename; multi-character synonyms like `繁中` or `zh-hant` match only as directory components) and returns at most one canonical short code from its fixed set (`tc`, `sc`, `en`, `ja`, `ko`, `fr`, `de`, `es`, `pt`, `ru`), or `None` when nothing matches. `FileMatch::language` (the AI's own hint) already exists in the engine and normalizes through the same map, but the command layer currently drops it (`language: None` is what even the test double yields); plan building only clones `subtitle_file.name`.

## Goals / Non-Goals

**Goals:**

- One click (per language) to select or clear that language's operations, on top of — never replacing — the per-row checkboxes.
- A single, backend-owned definition of "what language is this subtitle", so review labels and any future feature agree.
- Selection-state invariants preserved: chips, row checkboxes, selected count, and the disabled-at-zero Execute rule can never disagree.

**Non-Goals:**

- Hiding, filtering, or reordering rows (the spec forbids it: unmatched sections exist precisely so nothing silently vanishes, and the same principle applies here).
- A global Select-all / Clear-all button: the per-language chips plus per-row checkboxes already cover it for every realistic plan, and the wizard deliberately keeps the action bar for navigation only. Adding one would also duplicate the chips for single-language plans.
- Same quick-select on the Translate wizard: its files all share one user-chosen target language, so a language bar would be one meaningless chip.
- AI-based content language detection, cache-format changes, or execution-behavior changes.

## Decisions

### D1: Language is attached by the thin command layer, not re-detected in TypeScript

`MatchOperationDto` gains `language: Option<String>`. In `commands/match.rs`, the plan builder calls `LanguageDetector::get_primary_language(&op.subtitle_file.path)` while it already maps each `MatchOperation` to its DTO.

- *Why not frontend-only parsing of `subtitleName`?* The crate's detector also keys off directory components (`…/CHT/ep01.srt`), and the frontend literally does not have the source path. A TS mirror of the dictionary + three regexes would be a second source of truth that drifts from the crate's on every synonym addition — the repo's own `backendCodeParity.test.ts` exists because drift across the boundary is this project's recurring failure mode.
- *Why not the AI's `FileMatch::language`?* It is sometimes `None` even when the path is unambiguous (the scripted test double proves the engine tolerates that), costs a prompt to be more explicit, and makes review labels depend on model output. Path detection is deterministic and free; the AI hint stays in `reasoning`, shown verbatim as today.
- This stays within the "thin command layer" rule: one field, computed by a crate call at DTO-build time; no new commands, no engine changes, frontend-only *filtering*.

### D2: Chips are select/clear toggles, not visibility filters

Each chip activation applies group semantics to `selectedIds`: if every operation in the group is selected, deselect them all; otherwise select them all (tri-state like a checkbox's parent in the mental model, indeterminate folded into "select all"). Rows never move.

- *Alternative considered — a filter that dims/hides non-matching rows:* rejected because the review step's contract is that everything the user is about to authorize stays visible; a filter would make the Execute button's meaning depend on hidden state.
- *Alternative considered — "Select all zh-TW" / "Clear zh-TW" link pairs per language:* rejected as double the controls for what one toggle does, and the count on the chip already communicates the current state.

### D3: Membership and labels derive from the DTO on the frontend

`ReviewStep` groups operations by `operation.language`, in first-appearance order, with undetectable operations (`null`) gathered under a synthetic `Other` group. Path detection emits only the ten canonical codes above, so the display surface has exactly two cases: a known code renders its localized name from `match.json` keys `review.languages.<code>` (en: `Traditional Chinese`, zh-TW: `繁體中文`, etc.), and `null` renders the localized `Other` label. Defensive totality: the name lookup passes `defaultValue: code`, so a hypothetical future crate-dictionary code degrades to the raw code rather than a broken key — growing the dictionary then means adding the two locale keys, which `localeParity.test.ts` enforces together with the parity of every other key. Each chip carries an explicit `aria-label` from a dedicated key (mirroring the row's `review.selection` pattern) so assistive tech and tests never depend on concatenating the visible name+count. Grouping lives in `ReviewStep`/a small pure helper, not the hook, because it is a derived view of `plan`, and the hook stays the single owner of selection *state*.

### D4: Selection mutation goes through the hook

`useMatchWizard` gains `toggleLanguageSelection(ids: number[])`, implementing the all-selected→clear / otherwise→select rule over `selectedIds` (the same pure-set mutation shape as today's `toggleSelection`). `ReviewStep` gains an `onToggleLanguage(ids: number[])` prop and `MatchWizard.tsx` wires the two. Keeping mutation in the hook preserves the existing invariant that step components only render and report intent, and guarantees count/chip/checkbox sync since all three read the same `selectedIds`.

### D5: Chip markup and styling

`<button type="button" role="checkbox" aria-checked={state}>` per group inside `role="group"` with `aria-label` from a new `match.review.languageBarLabel` key, where `aria-checked` is `true`/`false`/`"mixed"` for all/some/none selected. Styling uses only existing tokens: `--radius-pill`, `--surface`/`--surface-hover`, `--surface-border`, `--text-secondary`, `--accent-text` for the pressed state — same vocabulary as `.review-step__operation`. The count renders beside the name as in `sources.scan.counts` style (`{{count}}`). A plan with only one group still renders it — consistent affordance beats conditional chrome.

## Risks / Trade-offs

- [Detector false positives: a path component like `en/` or a `.de.` infix in a non-language meaning gets labeled] → The chip only ever shows a name and count the user can verify against visible rows; toggling is non-destructive and reversible per row.
- [Detector misses a language the user considers obvious: `zh-TW`/`zh-Hant` as a filename suffix matches nothing (the 2–3-letter infix regex can't see hyphenated tags and the map has no `zh-tw`), so such files land in `Other`] → `Other` is still one-click selectable; broadening coverage is a crate dictionary change plus two new `review.languages.<code>` locale keys, which `localeParity.test.ts` forces to land together.
- [`FileMatch::language` from the AI and path detection could disagree once the AI hint is ever surfaced] → This change never mixes the two sources: chips read only the path-detected code; AI text stays in the reasoning disclosure.
- [Regenerated `bindings.ts` shifts unrelated types] → Diff is mechanical (`Option<String>` addition); `ipc_tests` and `ipcBoundary.test.ts` pin the boundary shape.
- [Chip state after the stale-plan/back-past-analysis `restart()`] → `restart()` already clears `selectedIds` and each new `analyze` re-selects everything (pre-existing behavior); chips are a pure function of `selectedIds` and need no extra reset. No behavior change.
