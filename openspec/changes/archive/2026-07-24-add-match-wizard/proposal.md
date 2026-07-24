# Proposal: add-match-wizard

## Why

AI subtitle matching is SubX's core value, and it is exactly the feature that intimidates non-terminal users: multiple sources, dry-run previews, and relocation flags. This change delivers the v1 flagship feature — a four-step wizard that wraps the `subx-cli` crate's `MatchEngine` in a guided flow: pick sources, let AI analyze, review the proposed matches, execute with a clear report.

**Depends on:** `add-tauri-app-shell` (WizardShell, command-layer conventions, i18n, theming) and `add-settings-page` (a configurable AI provider).

## What Changes

- Add Tauri commands `list_source_files`, `analyze_sources`, `cancel_analysis`, and `execute_selected` in the thin command layer, delegating to the `subx-cli` crate: `InputPathHandler`/`CollectedFiles` for source expansion (folders, files, archives), `MatchEngine::match_file_list_with_audit()` for analysis, and `MatchEngine::execute_operations_audit()` for execution that continues past per-item failures.
- Analysis results (`Vec<MatchOperation>` plus audit data) are held canonically in Tauri managed state keyed by a plan ID; the frontend receives display DTOs and refers back to operations by ID only.
- Stage-level progress (`scanning` / `analyzing` / `finalizing`) is emitted as Tauri events during analysis; analysis is cancellable.
- Add the Match wizard UI on top of `WizardShell`:
  - **Step 1 — Sources**: drag-and-drop or browse for multiple sources (folders, individual files, archives); scan preview showing counted videos and subtitles; relocation mode choice (rename in place / copy / move, default rename) — chosen here because the crate bakes relocation into each operation at analysis time, which also lets the review step show exact target paths.
  - **Step 2 — Analysis**: staged progress display, cancellable.
  - **Step 3 — Review**: results grouped by video; a video may have multiple matched subtitles (multi-language); zero-match videos and unmatched subtitles are listed in explicit unmatched sections; every match shows its target path, confidence, and AI reasoning; checkbox selection of which operations to run (all selected by default). No manual re-assignment in v1.
  - **Step 4 — Execute**: confirmation and execution with per-item results, and a final report listing successes and failures.
- Partial execution failures do not abort the run; they are collected and reported per item.

## Capabilities

### New Capabilities

- `match-workflow`: The end-to-end GUI match flow — multi-source selection and scanning, cancellable AI analysis with progress, review of an operation plan (grouped, confidence-annotated, checkbox-selectable), and selective execution with per-item reporting.

### Modified Capabilities

(none)

## Impact

- Backend: new `commands/match.rs`; `state.rs` gains `PlanState` storage (`Mutex<HashMap<PlanId, PlanState>>` plus the running-analysis task handle); `dto.rs` gains `SourceScanResult`, `MatchPlanDto`, `MatchOperationDto`, `ExecutionReportDto`; error mapping extended with match/AI error codes.
- Frontend: new `features/match-wizard/` (four step components inside `WizardShell`, wizard state machine); home hub's Match card becomes functional; new locale namespace `match` in `en` and `zh-TW`.
- Uses `subx-cli` crate APIs: `ComponentFactory::create_ai_provider()`, `MatchEngine::new()` with a manually built `MatchConfig` (mirroring the CLI's own pattern), `match_file_list_with_audit()`, `execute_operations_audit()`, `apply_unique_target_paths()`, `InputPathHandler`/`CollectedFiles`. No `subx-cli` changes.
- This completes the v1 feature set; convert/sync/translate reuse the established wizard + command patterns in later changes.
