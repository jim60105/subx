# Proposal: add-sync-wizard

## Why

Out-of-sync subtitles are the everyday pain SubX's `sync` command solves — locally, offline, with no AI configuration — but VAD detection, offset semantics, and force-overwrite flags are exactly the kind of surface non-terminal users bounce off. This change delivers the Sync wizard: pick a video and subtitle, detect the offset with local voice-activity detection (or enter one manually), review and fine-tune the number before anything is written, then save with a clear outcome.

**Depends on:** `add-tauri-app-shell` (WizardShell, command layer, i18n, theming) and `add-typed-ipc-bindings` (generated IPC contract). Reuses the cancellation/epoch patterns from `add-match-wizard`; no AI provider required.

## What Changes

- Add Tauri commands `detect_sync_offset`, `cancel_sync_detection`, and `apply_sync_offset` in the thin command layer, delegating to the crate: `FormatManager` for subtitle load/save and `SyncEngine` (`detect_sync_offset()` for VAD analysis, `apply_manual_offset()` for the shift).
- Add the Sync wizard UI on top of `WizardShell` as a four-step flow:
  - **Step 1 — Inputs**: pick one video (or audio) file and one subtitle file via drag-and-drop or browse; subtitle-only is allowed and restricts the flow to manual offset.
  - **Step 2 — Method**: automatic detection (local VAD, offline — with an optional per-run sensitivity override) or manual offset entry, validated against the configured `sync.max_offset_seconds`.
  - **Step 3 — Detect & review**: run the cancellable detection, then show the detected offset, confidence, and any warnings — with the offset presented in an editable field so the user can fine-tune it (or, in manual mode, skip detection and review the entered value). The adjusted value is what gets applied.
  - **Step 4 — Apply & report**: choose the output path (default `<stem>_synced.<ext>` beside the subtitle), confirm overwrite when the target exists, save, and show the result.
- Detection runs in a spawned, epoch-guarded task; a stray late result after cancel updates nothing.
- The original subtitle file is never modified in place; output always goes to a chosen path (which may only overwrite after explicit confirmation).

## Capabilities

### New Capabilities

- `sync-workflow`: The end-to-end GUI sync flow — video+subtitle input selection, method choice, cancellable local VAD offset detection with review and manual fine-tuning, and applying the offset to a saved output with overwrite protection.

### Modified Capabilities

(none)

## Impact

- Backend: new `commands/sync.rs`; `state.rs` gains a `SyncState` (single running-detection slot with epoch, mirroring `MatchState`'s guard — no plan storage needed, the reviewed value is just a number); `dto.rs` gains `SyncDetectionDto`, `SyncApplyResultDto` and option DTOs; error mapping extended with `sync.*` codes.
- Frontend: new `features/sync/` (four step components inside `WizardShell`, state hook, `syncApi.ts`); `ScreenId` gains `"sync"`; home hub card wired; new locale namespace `sync`; new screens registered in `hardCodedStrings.test.tsx`.
- Uses `subx-cli` crate APIs: `SyncEngine::new(SyncConfig)`, `detect_sync_offset()`, `apply_manual_offset()`, `FormatManager::load_subtitle()`/`save_subtitle()`. VAD (Silero via the `voice_activity_detector` crate) is bundled and offline — no model download, no network. No `subx-cli` changes.
- `src/types/bindings.ts` regenerated; every new command registered in `bindings.rs` and the IPC test allowlist.
- Batch sync (directory pairing) is explicitly deferred; see design Non-Goals.
