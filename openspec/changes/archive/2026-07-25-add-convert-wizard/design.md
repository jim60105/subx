# Design: add-convert-wizard

## Context

The shell established the thin command layer, `ErrorDto` codes, i18n, theming, and `WizardShell`; the match wizard established the backend patterns this change reuses: single-active-plan state with an epoch guard, `tauri::ipc::Channel` progress (a `tauri_specta::Event` cannot be registered from the generic `specta_builder`), an in-flight guard reserved before spawning, and contained duplication of CLI-inline logic where the crate offers no API.

Relevant `subx-cli` APIs (consumed, not modified):

- `cli::input_handler::InputPathHandler` / `CollectedFiles` — expands folders, files, and archives; `archive_origin()` identifies extracted files. The `CollectedFiles` owns the archive-extraction temp dirs.
- `FormatConverter::new(ConversionConfig)` + `convert_file(input, output, target_format) -> ConversionResult { success, input_format, output_format, converted_entries, errors, warnings }`. `ConversionConfig` carries `preserve_styling` (from config), `target_encoding`, `keep_original`, `validate_output`.
- `FileManager::remove_file()` — the delete-original path.

Three crate facts shape the design:

1. **Output-path resolution is CLI-inline, not a crate API.** `convert_command.rs` computes each output as `input.with_extension(fmt)`, except archive-extracted inputs which go beside the originating archive. The command layer mirrors this (~10 lines), as `add-match-wizard`'s D5 did for the archive rewrite.
2. **The encoding knob is a no-op on output.** `write_file_with_encoding()` ignores `target_encoding` and always writes UTF-8 (its own comment says "temporarily using UTF-8"); input encoding is auto-detected via `EncodingDetector`. The GUI therefore offers no encoding control — exposing one would be a lie the user discovers only by inspecting bytes.
3. **`convert_file` deletes nothing.** Original removal is the CLI's own post-success step (`FileManager::remove_file` when `!keep_original`), so the command layer owns that decision per item and can guarantee "delete only after success".

## Goals / Non-Goals

**Goals:**

- Three-step wizard: Sources → Options & preview → Convert & report, on `WizardShell`.
- Backend-owned conversion plan; frontend references items by ID.
- Exact output paths and conflict flags visible before anything is written.
- Batch execution with per-file progress, between-file cancellation, and per-item reporting.

**Non-Goals:**

- No output-encoding selection (see Context #2) and no per-file target-format overrides — one format per run.
- No conversion preview of subtitle *content* (no parsed-cue display); the plan previews paths, not text.
- No SMI/LRC output (the crate only serializes srt/ass/vtt/sub; SMI/LRC remain readable inputs).
- No settings-screen additions; `formats.default_output` and `formats.preserve_styling` are read from the shared config, with the format overridable per run.

## Decisions

### D1: Plan state mirrors `MatchState`, including the epoch guard

`preview_conversion(paths, options)` collects files once, resolves every output path, and stores the plan — items plus the owning `CollectedFiles` — in a `ConvertState` (single active plan, `tokio::sync::Mutex`), returning a `ConvertPlanDto` with a plan ID. `execute_conversion(plan_id, item_ids, channel)` consumes the stored plan; a stale or unknown ID yields `convert.stale_plan`.

Holding the plan backend-side is not optional here: archive-extracted inputs live in temp dirs owned by the step-1 `CollectedFiles`, so scan/preview and execution must share one collection or the previewed files may be gone (or re-extracted elsewhere) at execution time — the same ownership constraint match's D1 documented. Execution takes ownership of the `CollectedFiles` and holds it across all `convert_file().await` calls. The epoch/cancel/slot machinery is copied rather than abstracted: a premature generic "wizard state" abstraction over two users is exactly the altitude AGENTS.md warns against; extract it when translate makes a third copy compelling.

The scan step's `list_convert_inputs` is a separate, stateless command (counts only); the plan is created by `preview_conversion` when the user reaches step 2 with concrete options. Re-previewing (changed format, changed keep-original) replaces the active plan.

`preview_conversion` pins the epoch it read *before* collecting files and commits its plan only if the epoch is unchanged, exactly as match D3 guards analysis. This matters because Tauri does not cancel a command when the frontend stops awaiting it: backing out of a slow preview (a large archive) leaves it running server-side, and without the guard it could `commit_plan` *after* a newer preview, silently replacing the plan the user now acts on. The frontend therefore calls `cancel_conversion` — which bumps the epoch — whenever it abandons a plan (Back out of the options step, or Finish), so any in-flight preview fails its commit and the user's live plan wins.

### D2: Same-format inputs are auto-excluded, not converted in place

When an input's resolved output path equals the input path — the direct product of the CLI's `input.with_extension(fmt)` arithmetic for a file already carrying the target extension — `convert_file` would read and rewrite the same file, and the `!keep_original` branch would delete the file it just wrote. The preview therefore marks such items `skipped` (reason code `convert.already_target_format`), excludes them from selection, and the executor refuses them defensively. The skip condition is literally `resolved_output == input` (comparing the paths the plan actually computed, not re-deriving from extensions — which also sidesteps case-sensitivity mismatches), and it is evaluated *first*: a skipped item is never additionally flagged as an overwrite, even though its "output" trivially exists, so the UI never shows a contradictory skipped-plus-conflict state.

### D3: Overwrites are flagged, not blocked

The preview computes `outputExists` per item at preview time. The GUI default keeps such items selected but visibly flagged — conversion output is regenerable, and blocking would make the common "re-convert after fixing something" loop annoying. The report still records what was overwritten. (Contrast with sync, where an existing output blocks by default via `--force` semantics; convert's CLI has no force flag and overwrites silently, so the GUI adds visibility rather than inventing a stricter gate.)

Allowing overwrites makes write ordering matter: `convert_file` writes its output *before* running output validation, so a conversion that ends up reported as failed (`success: false`) has already replaced whatever was at the output path. The executor therefore points `convert_file` at a temporary sibling path and renames it over the real output only after observing `success: true`; on failure the temp file is discarded and a pre-existing output keeps its original content. Same-directory rename keeps the swap atomic on the same filesystem.

### D4: Keep-original defaults ON, inverting the CLI default

`ConvertArgs::keep_original` defaults to false — the CLI deletes originals unless asked not to. A GUI reaches users who won't read a flag description, and silent deletion of inputs is the kind of surprise that destroys trust in a v1. The wizard's toggle defaults to keeping originals; deletion is opt-in per run. Removal happens per item, only after that item's `convert_file` returned success — never on failure, never up front. Unlike the CLI, which discards `remove_file`'s result, a removal failure is surfaced as a per-item warning in the report — reporting "converted" while the original silently survives would misstate what is on disk.

### D5: Progress and cancellation reuse the match patterns verbatim

Per-file progress travels over a `tauri::ipc::Channel<ConvertProgress>` (`{ index, total, fileName }` plus a terminal stage) passed into `execute_conversion`, behind the same `ProgressReporter`-style seam for tests. Cancellation is cooperative between files: `cancel_conversion` bumps the state epoch and sets a cancel flag the executor checks before starting each file; the in-flight `convert_file` (single-file, local, fast) is allowed to finish. This keeps every written output a *complete* output — aborting mid-write is the one thing that could corrupt a file, and nothing here needs it. The executor slot is reserved before spawning (`convert.conversion_in_progress` on contention), exactly like analysis in match D3.

### D6: The default target format arrives with the first preview

The options step must show the format `formats.default_output` names, but `get_config` exposes only the AI section and this change adds no settings surface (Non-Goals). Rather than widen the config DTO for one read, `ConvertOptionsDto::target_format` is optional: a `null` means "resolve from the shared config", and `ConvertPlanDto` echoes the format the backend actually used. The step therefore learns the default from the same round trip that produces the paths it is about to render, and every later preview sends the format explicitly.

This keeps the config-reading where every other config read in this change already is — the backend, after `service.reload()` — and leaves the frontend with no second source of truth to drift from.

### D7: Error codes

`convert.no_subtitles` (scan found nothing convertible, surfaced at step 1), `convert.stale_plan`, `convert.conversion_in_progress`, and the item skip reasons `convert.already_target_format` (D2) and `convert.output_collision` (Risks, below). Per-item execution failures map through the shared `SubXError → core.<category>` conversion into the report DTO; the two-layer `ConversionResult { success: false, errors }` case (converter ran but validation failed) becomes a per-item error with the crate's message text, coded `core.subtitle_format`, mirroring the CLI's own synthetic mapping.

## Risks / Trade-offs

- [Filesystem changes between preview and execution make flags stale] → per-item failures are collected, not fatal; the report says what actually happened. `outputExists` is a preview-time hint, not a lock.
- [Two files can resolve to the same output path (e.g. `a.srt` and `a.ass` → `a.vtt`)] → the preview detects intra-plan output collisions and marks all but the first as conflicted/deselected (reason `convert.output_collision`); executing both would silently last-write-win.
- [Mirrored output-path logic can drift from the CLI] → confined to one function with a comment citing `convert_command.rs`; revisited when a `subx-core` extraction offers a real API.
- [`convert_file` on huge batches is sequential] → acceptable for v1; per-file progress keeps it honest, and the crate's converter is not safely parallel-documented.
- [Extension-based same-format detection misses misnamed files] → a `.srt` that actually contains ASS converts fine (parse is auto-detected); the skip rule only guards the output==input case, which is purely path arithmetic.

## Migration Plan

Not applicable — additive feature on an unreleased app.

## Open Questions

(none — options were settled against crate behavior above; per-file format overrides and encoding output are explicitly deferred until the crate supports them)
