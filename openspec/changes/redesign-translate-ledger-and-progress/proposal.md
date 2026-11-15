# Proposal

## Why

The Translate wizard's sources step shows every file twice — once in the added-sources list and again in the scan result below it — which the owner found confusing. Its run step shows only "file i of n" and elapsed seconds, so a long file looks stuck even though the engine knows which batch it is on.

## What Changes

- **Sources step**: replace the two stacked lists with one ledger grouped by source location (parent folder, folder source, or archive). Each found subtitle appears once — including a file reachable through more than one source, which is deduplicated in the backend — with its cue count or an unparsable flag; group headers carry a file count and cue subtotal; a summary row carries the totals.
- **Removal**: a group can be removed as a whole; a directly added file can also be removed on its own. Files found inside a folder or archive source have no per-file remove action.
- **Run step**: replace the single status sentence with one row per selected file. The active file shows a phase label, a bar with one segment per real AI batch, and a cue counter; waiting, finished, failed and cancelled files show as single lines. An estimated time remaining appears once two batches have returned.
- **Progress contract**: `TranslateProgress` grows from file-level to batch-level (phase, cue counters, batches done, batch in flight, resend flag, per-file completion).
- **Scan contract**: each scan item names the source that produced it, so the frontend can group.
- **Engine dependency**: raise `subx-core` to `1.1`, whose `ProgressEvent::Translation` events supply the batch-level facts. The backend attaches a `Reporter` to the engine; it parses no text and wraps no provider.
- Not included: terminology display, token usage, translated-text preview, per-file exclusion inside a folder or archive source.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `translate-workflow`: the sources step lists found subtitles once in a grouped ledger; removal granularity depends on the kind of source; execution additionally reports and displays batch-level progress.

## Impact

- **Prerequisite**: `subx-core` `1.1.0` published to crates.io (change `add-translation-progress-events` in the `subx-core` repository). Until then development may use a `[patch.crates-io]` path override, removed before merge.
- **Backend**: `src-tauri/Cargo.toml` and `Cargo.lock`; `src-tauri/src/commands/translate.rs` (scan item source and deduplication, engine reporter, progress emission); `src-tauri/src/state.rs` (`TranslatePlanItem.id`); the progress and scan DTOs.
- **IPC**: `src/types/bindings.ts` regenerated; `TranslateProgress`, `TranslateStage` and `TranslateScanItemDto` change shape. No command is added or removed.
- **Frontend**: `src/features/translate/` — `TranslateSourcesStep`, `TranslateRunStep`, `useTranslateWizard`, new ledger, progress-reducer and batch-bar units, both `translate.json` locales, the preview views in `scripts/preview/views.tsx`, and the `SCREENS` entries in `src/i18n/hardCodedStrings.test.tsx`.
- **Untouched**: `GroupedFileList` and the `source-intake` capability, which convert, sync and match keep using (the Translate sources step replaces that shared source list with this ledger, so the source-intake grouping requirement continues to cover the other wizards); the options and report steps; cancellation and output-writing behaviour.
- **Design reference**: `docs/superpowers/specs/2026-11-15-translate-ledger-and-batch-progress-design.md` and the mockup it names.
