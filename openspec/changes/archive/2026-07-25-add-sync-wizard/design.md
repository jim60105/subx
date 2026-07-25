# Design: add-sync-wizard

## Context

The match wizard established the backend patterns available for reuse: a single-slot in-flight guard reserved before spawning, epoch-guarded cancellation, and `tauri::ipc::Channel` progress. Sync is simpler than match in one decisive way — the thing carried from analysis to execution is a single number (the offset), not a rich operation plan — and that simplification drives most decisions below.

Relevant `subx-cli` APIs (consumed, not modified):

- `SyncEngine::new(SyncConfig)` — errs when `sync.vad.enabled` is false or the VAD detector fails to initialize (the engine is VAD-only today; `Auto` and `LocalVad` both route to VAD). **This gate applies to *constructing* the engine, not just to detection** — a crate coupling with a decisive consequence, see D6.
- `SyncEngine::detect_sync_offset(audio_path, &subtitle, Some(method)) -> SyncResult { offset_seconds: f32, confidence: f32, warnings, additional_info, .. }`.
- `SyncEngine::apply_manual_offset(&mut subtitle, offset_seconds)` — shifts timing; errs when the magnitude exceeds `sync.max_offset_seconds`. Pure arithmetic over `subtitle.entries` (no VAD, no I/O), but reachable only through an engine instance.
- `FormatManager::load_subtitle()` / `save_subtitle()` — parse and serialize with encoding detection; the crate enforces `general.max_subtitle_bytes` / `general.max_audio_bytes` size limits.
- `create_default_output_path()` (`cli/sync_args.rs`, public) — the `<stem>_synced.<ext>` naming rule.

VAD is the `voice_activity_detector` crate (Silero) with the model bundled — detection is fully local and offline, a fact the UI copy should state because it answers the privacy/cost question users bring from the AI-backed features.

## Goals / Non-Goals

**Goals:**

- Four-step wizard: Inputs → Method → Detect & review → Apply & report, on `WizardShell`.
- Cancellable local detection; the reviewed (editable) offset is what gets applied.
- No in-place modification; overwrite only after explicit confirmation.
- Per-run sensitivity override without touching the shared config file.

**Non-Goals:**

- **No batch/directory sync.** The CLI's batch mode pairs videos and subtitles by filename-prefix heuristics inline in `sync_command.rs` (~150 lines with same-directory and 1:1 special cases); duplicating that in the GUI is real drift risk for a flow whose GUI ergonomics (reviewing N detected offsets at once) deserve their own proposal. Single-pair covers the core need; batch is deferred.
- No archive sources — the user picks two concrete files; archive expansion buys nothing here.
- No VAD segment visualization or waveform display; `additional_info.detected_segments` stays backend-side for now.
- No exposure of the CLI's `--window` argument (the current engine only prints it) or the deprecated correlation fields.
- No settings-screen additions; defaults are read per run.

## Decisions

### D1: No plan state — detection returns a value, apply takes a value

`detect_sync_offset` returns `SyncDetectionDto` and stores nothing; `apply_sync_offset(media?, subtitle, offset_ms, output_path, overwrite)` re-loads the subtitle, applies the offset, and saves. There is no plan ID and no stale-plan code. Rationale: the only artifact of detection is a number the user can (and should be able to) edit — round-tripping it through the frontend is the *feature*, not a risk, and re-loading the subtitle at apply time (milliseconds of work) removes any backend session state to invalidate. The alternative — holding the parsed `Subtitle` in managed state between detect and apply, as match holds its plan — was rejected: it adds a staleness protocol to save one cheap re-parse, and unlike match's `CollectedFiles` temp dirs, nothing here has ownership constraints. If the file changes on disk between detect and apply, the offset applies to the new content; that is listed as a risk, not prevented.

### D2: Detection task reuses the slot + epoch guard; no progress channel

Detection runs in a spawned task governed by a `SyncState` copied from `MatchState`'s guard machinery: the slot is reserved before spawning (`sync.detection_in_progress` on contention), `cancel_sync_detection` aborts the task and bumps the epoch, and a late result whose epoch is stale is discarded — the same commit-race fix as match D3. The frontend mirrors it with the same per-call generation ref.

The epoch travels with **every** slot transition, not just the commit. Reserving the slot and registering the abort handle cannot be one lock — `tokio::spawn` sits between them — so a cancel can land in that gap, find no handle, and abort nothing. `set_running` therefore aborts a task whose epoch is already gone rather than adopting it, and `finish_detection`/`commit` release nothing when their epoch is stale. Without that, an orphaned detection could keep running unstoppably *and*, on its way out, clear a slot a newer detection had since taken — leaving that run uncancellable and admitting a third alongside it.

No progress channel: match's channel exists because analysis has three truthful stages; sync detection has one ("analyzing the audio"), and a single-stage channel is ceremony. The UI shows an indeterminate spinner with elapsed time. One honesty caveat documented in code: tokio abort lands at `.await` points, and VAD's decode/inference loop is CPU-bound between them, so cancellation may take effect with a delay — the epoch guard is what guarantees the *user-visible* contract (a cancelled detection never surfaces a result), not instant CPU release.

### D3: Offsets cross IPC as `i32` milliseconds

The crate speaks `f32` seconds. IPC uses integer milliseconds (`i32` — `i64` cannot cross the boundary, and ±596 h of range dwarfs any real offset), converted at the boundary exactly as the CLI's JSON payload does (`(seconds * 1000).round()`). This keeps the editable field a clean number, avoids float-formatting artifacts in the UI, and matches the precision subtitles actually carry.

### D4: Config defaults reach the frontend via a `get_sync_defaults` command

Step 2 needs `sync.vad.sensitivity`, `sync.default_method`, and `sync.max_offset_seconds` to seed its controls and validate locally before any backend call. A small read-only command returns them (after `service.reload()`, per the config-freshness invariant). The backend still re-validates on both detect and apply — the command layer enforces the max itself (design D6) and maps the rejection to `sync.offset_exceeds_max` with the limit in the DTO — so frontend validation is UX, not the security boundary. Both checks compare **whole milliseconds**: the limit crosses IPC as `maxOffsetMs`, and re-deriving it from the raw `f32` seconds at apply time would put the two on either side of a rounding boundary, letting a value the UI called legal be refused a moment later. Per-run sensitivity travels as an optional override on the detect call and is applied to a cloned `SyncConfig`, mirroring the CLI's `apply_cli_overrides`; the shared config file is never written.

### D5: Overwrite is a retry-with-flag protocol

`apply_sync_offset` takes `overwrite: bool`. When the target exists and the flag is false, the command fails with `sync.output_exists` *before* doing any work; the UI shows a confirmation and retries with the flag set.

The retry sends **the target that was refused**, captured at the rejection, not whatever the still-editable output field holds when the button is clicked — and editing the field retracts the confirmation entirely. `overwrite: true` skips the existence check by construction, so a confirmation that inherited permission across a path change would replace a file the user was never warned about. (The captured target is wrapped rather than stored bare: `null` is itself a valid target meaning "the default `_synced` name", so it cannot double as "nothing pending".) This mirrors the CLI's `--force` semantics (sync blocks by default where convert overwrites silently — the GUI keeps each feature's native contract) and keeps the command stateless. The default output path duplicates the crate's public `create_default_output_path()` naming; computed frontend-side for display, recomputed backend-side when no explicit path is given.

### D6: Apply never constructs a `SyncEngine` — the offset shift is mirrored in the command layer

`SyncEngine::new` hard-fails whenever the VAD detector cannot be built, *even for callers that only want `apply_manual_offset`* — the method is pure timestamp arithmetic but is reachable only through an engine instance (Context). If `apply_sync_offset` built an engine, the one flow this wizard promises works everywhere ("manual offset remains usable when VAD is unavailable") would break exactly when VAD is unavailable. The apply path therefore mirrors `apply_manual_offset`'s logic directly in the command layer (~30 lines, cited to `core/sync/engine.rs`): validate `|offset| ≤ sync.max_offset_seconds` (mapping the rejection to `sync.offset_exceeds_max`), then shift every entry — positive offsets erroring on overflow, negative offsets clamping start/end at zero, matching the crate exactly. This is the same contained-duplication pattern the other wizards use for CLI-inline logic. Only `detect_sync_offset` constructs an engine, so `sync.vad_unavailable` genuinely scopes to detection. A dedicated test applies a manual offset with `sync.vad.enabled = false` to pin the promise.

### D7: Error codes

`sync.vad_unavailable` (engine construction failed during *detection*; hint code points at manual offset still working — true by construction, per D6), `sync.detection_in_progress`, `sync.detection_cancelled` (the abandoned task's own rejection, which the frontend discards — the mirror of `match.analysis_cancelled`), `sync.offset_exceeds_max` (limit included in the DTO message and reviewed value re-checked at apply), `sync.output_exists` (drives the confirm-retry flow), and `sync.output_is_input` (the ways "never modified in place" could be violated: an explicitly typed output path equal to the input; a subtitle with no extension, for which the crate's `create_default_output_path` returns the input unchanged; and — only on a case-insensitive filesystem — an output differing from the input by case alone, which raw path equality misses and the existence check then reports as a merely pre-existing file the user can confirm away). The comparison therefore goes through the shared `paths::path_key`, extracted from `commands::convert` where the same folding already guarded the same class of bug. Everything else — unreadable media, no audio track, oversized files, unparsable subtitles — maps through the shared `SubXError → core.<category>` conversion (`core.audio_processing`, `core.subtitle_format`, …), which already yields distinct, localizable codes.

Detection warnings travel as `ErrorDto`s carrying the stable code `sync.detection_warning`, not as bare strings. The crate's warnings are English prose assembled at runtime (`"Detected offset 91.00s exceeds configured maximum value 60.00s…"`), and the backend never emits translated text — so the prose lands in `ErrorDto::message`, where `ErrorNotice` already shows it as technical detail beneath a localized headline, exactly as a per-item conversion failure does.

## Risks / Trade-offs

- [Subtitle or media file changes on disk between detect and apply] → accepted (D1); the offset is applied to whatever the subtitle contains at apply time, and the report shows the written path. No worse than the CLI, which holds no state either.
- [Cancellation cannot interrupt CPU-bound VAD inference instantly] → epoch guard guarantees the result is discarded; the spinner's cancel gives immediate UI feedback while the task winds down in the background. Documented rather than fought.
- [Detection on long media is slow (full audio decode)] → the spinner shows elapsed time and stays cancellable; `general.max_audio_bytes` (crate-enforced, default 2 GiB) bounds the worst case. If this proves painful, a future crate-side windowing API is the fix — not GUI-side chunking.
- [Detected offset may exceed `max_offset_seconds`, making apply fail after a successful detection] → the review step compares the (edited) value against the limit fetched in D4 and warns inline before the user reaches apply; the backend re-check is the final word.
- [Low-confidence detections mislead users] → confidence is displayed prominently with the warnings the engine already produces; choosing a threshold to *block* on would be inventing product policy the crate doesn't claim — deferred until real feedback exists.
- [Duplicated `_synced` naming rule] → `create_default_output_path` is public; the frontend copy is display-only and the backend calls the crate function, so drift shows up visibly in the proposed path, not in behavior.
- [Mirrored offset-shift math (D6) can drift from the crate] → confined to one function with a comment citing `core/sync/engine.rs::apply_manual_offset`, and the round-trip test pins the observable behavior (including the negative-offset clamp-to-zero rule); revisited when the crate decouples the shift from engine construction.

## Migration Plan

Not applicable — additive feature on an unreleased app.

## Open Questions

(none — batch sync and segment visualization are explicitly deferred to their own proposals)
