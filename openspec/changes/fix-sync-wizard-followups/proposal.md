# Proposal

## Why

Implementing the sync preview series left four small defects behind: the Rust crate is not rustfmt-clean, keyboard focus is dropped when Start detection turns into the disabled "Detecting…" button, leaving the Sync screen mid-detection leaves the backend VAD run going, and the offset nudge buttons fail WCAG 2.5.3 (Label in Name) because their accessible names do not contain their visible text. All four are cheap to fix now while the code is fresh.

## What Changes

- Run rustfmt over the whole `src-tauri` crate (`cargo fmt --manifest-path src-tauri/Cargo.toml`) so that `cargo fmt --manifest-path src-tauri/Cargo.toml --check` exits 0. Today it reports drift in 11 files under `src-tauri/src`, starting with the `static SILENCE` line in `audio_fallback.rs`. This is formatting only, with no behaviour change, and it lands in its own commit.
- `WizardShell` gains an opt-in `takeFocus` flag on `secondary` actions. When a secondary action newly declares it, the shell moves keyboard focus to that control, but only if focus is on the document body or inside the action bar. Slot placement does not change.
- The sync wizard's detecting state sets `takeFocus` on its Cancel action. Starting a detection from either the primary or a secondary Start control therefore leaves focus on Cancel instead of on a disabled or removed button.
- Unmounting the sync wizard while a detection runs (navigating Home or to Settings) cancels the backend run the same way the Cancel button does. The pending cancel promise moves from a per-instance ref to module scope, so a freshly mounted wizard's next detection still waits for the previous instance's cancel to settle (the existing cancel-then-start ordering guarantee).
- The nudge buttons' accessible names (`offset.decrease` / `offset.increase` in `en` and `zh-TW`) now begin with their visible text (`−50 ms` / `+50 ms`, `−50 毫秒` / `+50 毫秒`). Tests that query the old names are updated, and a test asserts the name-begins-with-text rule in both locales.

Human-reviewed: the wording of the new nudge accessible names is reviewed by a person using the review document named in `design.md` ("Human review: nudge accessible-name wording"). Tests check only the name-begins-with-visible-text mechanism, never the exact wording.

Excluded (human work, not in this change): the manual packaged-preview check, release workflow dispatch, the visual-review Verdict column, and real-device audio, Windows and macOS verification.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `app-shell`: new requirement that a `secondary` action can take keyboard focus when it appears.
- `sync-workflow`: three added requirements, with no existing requirement text changed: "Starting detection keeps keyboard focus" (focus moves to Cancel), "Leaving the wizard cancels a running detection" (cancel on unmount, with ordering across wizard instances), and "Nudge controls' accessible names begin with their visible text".

## Impact

- Rust (formatting only): `src-tauri/src/audio_fallback.rs`, `commands/config.rs`, `commands/convert.rs`, `commands/match.rs`, `commands/sync.rs`, `commands/translate.rs`, `error.rs`, `ipc_tests.rs`, `lib.rs`, `media_server.rs`, `state.rs`, all under `src-tauri/src`.
- Frontend: `src/components/WizardShell/WizardShell.tsx`, `src/features/sync/SyncWizard.tsx`, `src/features/sync/useSyncWizard.ts`, `src/locales/en/sync.json`, `src/locales/zh-TW/sync.json`.
- Tests: `src/components/WizardShell/WizardShell.test.tsx`, `src/features/sync/SyncWizard.test.tsx`, `src/features/sync/useSyncWizard.test.ts`, `src/features/sync/OffsetField.test.tsx`, `src/features/actionPlacement.test.tsx` (test-reset hook only).
- No IPC, bindings, backend behaviour or dependency changes.
