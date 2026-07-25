# Proposal: add-convert-wizard

## Why

Format conversion is the most-requested everyday subtitle chore and, unlike match, needs no AI configuration — it is the feature a first-time user can succeed with immediately. The home hub already shows a disabled Convert card; this change makes it real with a guided flow over the `subx-cli` crate's `FormatConverter`, following the wizard + thin-command patterns `add-match-wizard` established.

**Depends on:** `add-tauri-app-shell` (WizardShell, command layer, i18n, theming) and `add-typed-ipc-bindings` (generated IPC contract). Independent of the match wizard at runtime, but deliberately reuses its state/progress/cancellation patterns.

## What Changes

- Add Tauri commands `list_convert_inputs`, `preview_conversion`, `execute_conversion`, and `cancel_conversion` in the thin command layer, delegating to the crate: `InputPathHandler`/`CollectedFiles` for source expansion (folders, files, archives) and `FormatConverter::convert_file()` per file.
- A conversion plan (resolved output paths plus the step-1 `CollectedFiles`, whose temp dirs keep archive-extracted inputs alive) is held in Tauri managed state keyed by a plan ID, mirroring the match wizard's single-active-plan pattern; the frontend refers to items by ID only.
- Add the Convert wizard UI on top of `WizardShell` as a three-step flow:
  - **Step 1 — Sources**: drag-and-drop or browse for multiple sources (folders, individual files, archives); scan preview counting detected subtitle files; blocking state when none are found.
  - **Step 2 — Options & preview**: target format (srt / ass / vtt / sub, defaulting from `formats.default_output` — resolved by the backend on the first preview and echoed back on the plan), keep-original toggle (GUI default ON — deleting inputs is opt-in, inverting the CLI's default), and a per-file preview of exact output paths with conflict flags (existing file would be overwritten; input already in the target format resolves to itself and is auto-excluded; two inputs resolving to one output keep only the first). Per-item checkboxes choose what runs.
  - **Step 3 — Convert & report**: per-file progress over an IPC channel, cancel between files, and a final per-item report of successes and failures.
- Per-file failures do not abort the batch; they are collected and reported per item.
- No output-encoding option is offered: the crate auto-detects input encoding and always writes UTF-8 (its `target_encoding` knob is currently a no-op), so the UI states that instead of exposing a dead control.
- The home hub's Convert card becomes functional; a new `convert` locale namespace is added in `en` and `zh-TW`.

## Capabilities

### New Capabilities

- `convert-workflow`: The end-to-end GUI conversion flow — multi-source selection and scanning, an output-path preview with conflict handling and per-item selection, and batch execution with per-file progress, cancellation, and a per-item report.

### Modified Capabilities

(none — `app-shell`'s hub requirements already cover enabling a card once its feature exists)

## Impact

- Backend: new `commands/convert.rs`; `state.rs` gains a `ConvertState` (single active plan + running-execution guard, mirroring `MatchState`); `dto.rs` gains `ConvertScanResult`, `ConvertPlanDto`, `ConvertProgress`, `ConversionReportDto`; error mapping extended with `convert.*` codes.
- Frontend: new `features/convert/` (three step components inside `WizardShell`, state hook, `convertApi.ts`); `ScreenId` gains `"convert"`; home hub card wired; new locale namespace `convert`; new screens registered in `hardCodedStrings.test.tsx`.
- Uses `subx-cli` crate APIs: `InputPathHandler`/`CollectedFiles`, `FormatConverter::new(ConversionConfig)` + `convert_file()`, `FileManager::remove_file()` for the delete-original path. No `subx-cli` changes. The CLI's inline output-path resolution (archive-origin outputs land beside the archive) is deliberately mirrored in the command layer, as `add-match-wizard` did for the archive rewrite.
- `src/types/bindings.ts` regenerated; every new command registered in `bindings.rs` and the IPC test allowlist.
