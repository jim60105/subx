# Tasks: add-sync-wizard

## 1. Backend — State & DTOs

- [ ] 1.1 Add `SyncState` to `state.rs`: the single running-detection slot with abort handle and epoch, copied from `MatchState`'s guard machinery (reserve before spawn; cancel bumps the epoch so a late result is discarded — design D2). No plan storage (design D1). Wire `AppState::sync_state()`
- [ ] 1.2 Define DTOs in `dto.rs`: `SyncDefaultsDto` (`defaultMethod`, `vadSensitivity`, `maxOffsetMs`), `SyncDetectionDto` (`offsetMs: i32`, `confidence: f32`, `warnings: Vec<String>`), `SyncApplyResultDto` (written output path). Offsets are `i32` milliseconds at the boundary, converted `(seconds * 1000).round()` (design D3 — no `u64`/`i64` may cross IPC); absent optionals travel as explicit `null`
- [ ] 1.3 Extend error mapping with `sync.vad_unavailable` (with hint code), `sync.detection_in_progress`, `sync.offset_exceeds_max`, `sync.output_exists`; add `codes.`/`hints.` locale entries in **both** `en` and `zh-TW` `errors` namespaces

## 2. Backend — Commands

- [ ] 2.1 Implement `get_sync_defaults()`: `service.reload()` first, then return `sync.default_method`, `sync.vad.sensitivity`, and `sync.max_offset_seconds` as `SyncDefaultsDto` (design D4)
- [ ] 2.2 Implement `detect_sync_offset(media_path, subtitle_path, sensitivity_override)`: reserve the slot (`sync.detection_in_progress` on contention), spawn the task, build `SyncEngine::new` from a cloned `SyncConfig` with the per-run sensitivity applied (mirroring the CLI's `apply_cli_overrides`; never write the shared config); map engine-construction failure to `sync.vad_unavailable`; load the subtitle via `FormatManager`, call `engine.detect_sync_offset(…, Some(method))`, commit the result only if the epoch is unchanged, and return `SyncDetectionDto`
- [ ] 2.3 Implement `cancel_sync_detection()` aborting the stored task and bumping the epoch; document the CPU-bound abort-delay caveat where the abort handle is used (design D2)
- [ ] 2.4 Implement `apply_sync_offset(subtitle_path, offset_ms, output_path, overwrite)`: fail with `sync.output_exists` before any work when the target exists and `overwrite` is false (design D5); default the output via the crate's public `create_default_output_path()` when none is given; load the subtitle and shift it with the command layer's **mirror of `apply_manual_offset`** — never by constructing a `SyncEngine`, whose constructor hard-fails without VAD (design D6): validate `|offset| ≤ sync.max_offset_seconds` mapping rejection to `sync.offset_exceeds_max` (the apply-time re-check of design D4), shift entries with positive-overflow error and negative clamp-to-zero exactly as the crate does (cite `core/sync/engine.rs` in a comment); `save_subtitle()` to the output, never the input; return `SyncApplyResultDto`
- [ ] 2.5 Register all four commands in `bindings.rs`'s single `collect_commands![…]` and add each to `ipc_tests.rs`'s `COMMANDS` allowlist
- [ ] 2.6 Backend tests with `TestConfigService` + `tempfile`: defaults read-through, manual offset over the max rejected at apply, offset round-trip (+1.000 s shifts a 5 s cue to 6 s in the output while the input is untouched), negative-offset clamp-to-zero matching the crate, default `_synced` naming, output-exists → overwrite retry, detection guard (concurrent rejection, cancel discards a late result via epoch), `sync.vad_unavailable` from `detect_sync_offset` when `sync.vad.enabled = false`, **and manual apply succeeding with `sync.vad.enabled = false`** — the test that pins design D6's promise that VAD unavailability never breaks manual offset. VAD detection itself gets one small-fixture test (generated WAV with speech-shaped tone bursts) if runtime cost allows; otherwise the detection-happy-path scenario is covered through the review-step component test with mocked IPC plus the engine's own crate tests — decide during implementation, never by widening a coverage exclusion

## 3. Frontend — Wizard

- [ ] 3.1 Add `"sync"` to `ScreenId`, wire the home hub's Sync card (enabled; update `HomeScreen.test.tsx`), and implement `useSyncWizard` (step machine; subtitle-only forces manual mode; back past Detect discards the detection via cancel + generation ref)
- [ ] 3.2 Step 1 Inputs: media + subtitle pickers (drag-and-drop + browse via `tauri-plugin-dialog`), subtitle-only allowed with explanatory copy, next disabled until a subtitle is present
- [ ] 3.3 Step 2 Method: automatic (VAD, "local & offline" copy) vs manual radio; sensitivity control seeded from `get_sync_defaults` (per-run only); manual offset input with inline `sync.offset_exceeds_max` validation against the fetched limit
- [ ] 3.4 Step 3 Detect & review: spinner with elapsed time and cancel while detecting; on completion show confidence and warnings with the offset in an editable field (the applied value); manual mode skips detection and shows the entered value; over-limit values warn inline before apply
- [ ] 3.5 Step 4 Apply & report: output path field defaulting to the `_synced` name, `sync.output_exists` confirm-then-retry-with-overwrite flow, success/failure report showing the written path
- [ ] 3.6 Add the `sync` locale namespace with complete `en` and `zh-TW` strings; register every new screen component in `hardCodedStrings.test.tsx`'s `SCREENS`

## 4. Tests & Verification

- [ ] 4.1 Component tests (IPC mocked via `mockIPC`): step transitions incl. subtitle-only gating, defaults seeding, offset editing flows, cancel/late-result discard via generation ref, overwrite confirmation flow, report rendering
- [ ] 4.2 Annotate each new `#### Scenario:` with `// @covers <id>` copied verbatim from `npm run spec:trace -- --report` directly above the verifying test; if the VAD-detection happy path ends up unreachable by automation (task 2.6), waive it in `scripts/spec-coverage.config.json` with `reason` and `manualVerification`, following the existing NVIDIA/Wayland waiver's shape
- [ ] 4.3 Sync the `sync-workflow` delta into `openspec/specs/sync-workflow/spec.md` during implementation; archive later with `--skip-specs`
- [ ] 4.4 `npm run bindings:generate` and commit `src/types/bindings.ts`; `npm run verify` clean end to end (tsc, both 85 % coverage gates, spec:trace, bindings:check); `cargo clippy` clean
- [ ] 4.5 Manual end-to-end check with a real episode: VAD detection on a drifted subtitle, fine-tune, apply, play back the result
