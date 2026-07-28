# Proposal: add-translate-wizard

## Why

Translation is the second AI-powered pillar of SubX and the last disabled card on the home hub. The crate's `TranslationEngine` already does the hard parts — terminology extraction, batched cue translation with ID validation, inline-formatting protection — but the CLI front door (language flags, glossary files, replace/force semantics) is unapproachable for GUI users. This change completes the v1 feature set with a Translate wizard: pick subtitles, set the target language and optional glossary/context, watch per-file progress, and get a per-item report.

**Depends on:** `add-tauri-app-shell`, `add-settings-page` (a configured AI provider), and `add-typed-ipc-bindings`. Reuses the plan-state, channel-progress, and cancellation patterns from `add-match-wizard` and their convert-wizard reprise.

## What Changes

- Add Tauri commands `preview_translation`, `execute_translation`, and `cancel_translation` in the thin command layer, delegating to the crate: `InputPathHandler`/`CollectedFiles` for source expansion (folders, files, archives), `FormatManager` for parsing, `parse_glossary_text()` for glossary input, and `TranslationEngine::translate_subtitle()` per file.
- A translation plan (per-file output resolution plus the scan's `CollectedFiles`, whose temp dirs keep archive-extracted inputs alive) is held in Tauri managed state keyed by a plan ID, mirroring the match/convert pattern.
- Add the Translate wizard UI on top of `WizardShell` as a four-step flow:
  - **Step 1 — Sources**: drag-and-drop or browse for multiple sources (folders, files, archives); scan preview listing subtitle files with per-file cue counts, giving a cost sense before any AI call.
  - **Step 2 — Options**: target language (prefilled from `translation.default_target_language`, required), optional source language, optional free-text context, optional glossary entered as `source = target` lines, output mode (new file with language suffix — default — or replace originals, honoring the config's backup setting), and an overwrite toggle for existing outputs.
  - **Step 3 — Translate**: per-file progress over an IPC channel, cancellable; a per-file failure does not abort the batch.
  - **Step 4 — Report**: per-item outcomes with output paths, failures with actionable error codes.
- Output paths follow the CLI's rules: `<stem>.<target-language>.<ext>` beside the input (beside the originating archive for extracted files); replace mode is refused for archive-extracted subtitles and creates a backup when `general.backup_enabled` is on.
- The home hub's Translate card becomes functional — with this change every hub card is live; a new `translate` locale namespace is added in `en` and `zh-TW`.

## Capabilities

### New Capabilities

- `translate-workflow`: The end-to-end GUI translation flow — multi-source selection with cue-count preview, language/glossary/context options with output-mode resolution and conflict handling, and batch execution with per-file progress, cancellation, and a per-item report.

### Modified Capabilities

(none)

## Impact

- Backend: new `commands/translate.rs`; `state.rs` gains a `TranslateState` (single active plan + running-execution guard with epoch, same shape as `MatchState`/`ConvertState`); `dto.rs` gains `TranslatePlanDto`, `TranslateProgress`, `TranslationReportDto` and option DTOs; error mapping extended with `translate.*` codes.
- Frontend: new `features/translate/` (four step components inside `WizardShell`, state hook, `translateApi.ts`); `ScreenId` gains `"translate"`; home hub card wired; new locale namespace `translate`; new screens registered in `hardCodedStrings.test.tsx`.
- Uses `subx-cli` crate APIs: `create_ai_provider()`, `TranslationEngine::new(provider, translation.batch_size)`, `translate_subtitle()`, `parse_glossary_text()`, `FormatManager`, `InputPathHandler`/`CollectedFiles`. No `subx-cli` changes. The CLI's private output-resolution and backup-naming logic (`resolve_output_path`, `backup_path` in `translate_command.rs`) is deliberately mirrored in the command layer, as prior wizards did for their CLI-inline logic.
- `src/types/bindings.ts` regenerated; every new command registered in `bindings.rs` and the IPC test allowlist.
- This change completes the planned v1 surface: all four hub cards (Match, Convert, Sync, Translate) are functional.
