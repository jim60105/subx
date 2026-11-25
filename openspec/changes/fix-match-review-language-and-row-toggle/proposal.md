# Proposal

## Why

On Match step 3 the AI's detected language reaches the resulting file name (`.sc.srt`, `.th.srt`), yet the language controls put every pairing under Other, so selecting by language is useless. Selecting one pairing also requires hitting a very small checkbox. Both problems were reported against 0.4.0 and are still present in the code at 1.0.0 (`e70d69a`).

## What Changes

- An operation's reported language comes from the language tag in its resulting file name; detection on the source path remains only as the fallback. The row badge and the quick-select controls both follow, with no IPC shape change.
- Language codes that have no hand-written label (for example `th`) are named by the platform's locale data instead of being shown as a bare code.
- Clicking anywhere on a pairing row toggles it, except on a nested control (checkbox, reasoning disclosure), which keeps its own behavior. The checkbox remains the only keyboard and screen-reader control for selection.
- Pairing rows show a pointer cursor and a hover background. How that looks is **human-reviewed** in `visual-review.md` and is not enforced by a test.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `match-workflow`: adds requirements for where an operation's language comes from, how quick-select controls name languages without a hand-written label, and row-wide selection.

## Impact

- Backend: `src-tauri/src/commands/match.rs`; the doc comment of `MatchOperationDto::language` in `src-tauri/src/dto.rs`, hence regenerated `src/types/bindings.ts` (comment only).
- Frontend: `src/features/match/ReviewStep.tsx`, `ReviewStep.css`, `languageGroups.ts` and their tests.
- `CHANGELOG.md`. No new dependency, command, configuration key, or locale key.

## Batch:

Single change. `depends-on:` none. No conflicts: no other change is active.
