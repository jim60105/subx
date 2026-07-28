# Design: add-translate-wizard

## Context

This is the third wizard over the patterns match established and convert reprised: single-active-plan state with epoch-guarded cancellation, `tauri::ipc::Channel` progress (a `tauri_specta::Event` cannot be registered from the generic `specta_builder`), an `AiProviderFactory`-style seam for tests, and contained duplication of CLI-inline logic the crate does not export.

Relevant `subx-cli` APIs (consumed, not modified):

- `TranslationEngine::new(Arc<dyn AIProvider>, batch_size)` — built from `create_ai_provider()` plus `translation.batch_size`; rejects a zero batch size. (`ComponentFactory::create_translation_engine()` exists but building from the provider directly keeps the same test seam the match wizard uses.)
- `TranslationEngine::translate_subtitle(subtitle, &TranslationRequest) -> TranslationResult` — pure in-memory: cue-ID assignment, one terminology-extraction request, batched translation with unknown-ID retry, missing-cue retry, then reapplication preserving timing, ordering, cue count, and inline formatting (HTML-like and ASS override tags are protected by placeholders). No filesystem I/O and **no progress callback** — progress prints go to stderr, invisible here.
- `parse_glossary_text()` (public) — `source = target` / `source -> target` lines, `#` comments.
- `TranslationRequest { target_language, source_language, glossary_text, context, glossary_entries }`.
- `cli::input_handler::InputPathHandler` / `CollectedFiles` — source expansion; the `CollectedFiles` owns archive-extraction temp dirs.
- `FormatManager::load_subtitle()` / `save_subtitle()`.

Two CLI-inline facts shape the design: output resolution (`resolve_output_path`, `explicit_output_path`, `default_output_path`, `backup_path` in `translate_command.rs`) is **private**, so the suffix naming (`{stem}.{lang}.{ext}`), archive-origin redirect, replace/backup rules, and force semantics must be mirrored in the command layer; and the CLI's failure model aggregates per-file errors into one final error, whereas the GUI wants per-item isolation in the report — so the command layer loops over files itself rather than calling `translate_command::execute`.

## Goals / Non-Goals

**Goals:**

- Four-step wizard: Sources → Options → Translate → Report, on `WizardShell`.
- Cost visibility before the first AI request (per-file cue counts).
- Backend-owned plan (output resolution + `CollectedFiles` ownership); per-file execution with isolation, channel progress, and cancellation.
- CLI-compatible output rules so GUI and CLI users see identical file layouts.

**Non-Goals:**

- No per-file target-language overrides — one language per run.
- No glossary *file* picker; the glossary is a textarea whose content is passed as text (`glossary_text`) and parsed entries (`glossary_entries`), same as the CLI does with a file's content. A file picker adds a second input path for identical bytes.
- No intra-file progress (cues/batches): the engine exposes no hook (Context); inventing percentages would be fiction. Per-file granularity only, honestly labeled.
- No translation memory, no editing of translated text in the report, no terminology-map display — each a future proposal if wanted.
- No settings-screen additions; `translation.default_target_language` and `batch_size` are read per run.

## Decisions

### D1: Plan state mirrors convert's, and for the same ownership reason

Step 1 and Step 2 are two commands, as in convert. `list_translate_inputs(paths)` scans the sources for their names and cue counts and reports the configured `translation.default_target_language`; it takes **no options**, because Step 1 runs before Step 2 offers anywhere to type a target language, and a plan cannot be resolved without one — a single fused command would fail Step 1 with `translate.no_target_language` on any install that has not set the configuration default, with no field on screen to fix it.

`preview_translation(paths, options)` collects sources once, parses each file for its cue count (which doubles as early parse validation — unparsable files are flagged in the preview instead of failing mid-run), resolves every output path per the mirrored CLI rules, detects intra-plan output collisions (see below), and stores items + `CollectedFiles` in a `TranslateState` (single active plan, epoch, executor slot). `execute_translation(plan_id, item_ids, channel)` consumes it; stale IDs yield `translate.stale_plan`. The `CollectedFiles` must live in the plan: archive-extracted inputs sit in its temp dirs and are read at execution time. Re-previewing (changed language or output mode re-resolves every path) replaces the plan. The guard machinery is a third copy of the match pattern; if this change lands after convert, extracting a shared `SingleSlotState` helper in `state.rs` is fair game during implementation, but the specs do not require it.

### D2: The command layer owns the per-file loop; the engine owns everything within a file

Per selected item: `load_subtitle` → `translate_subtitle` → (replace mode: write `<name>.<ext>.backup` first when `general.backup_enabled`) → `save_subtitle`. Failures are caught per item, mapped, pushed into the report, and the loop continues — the isolation model convert established, deliberately different from the CLI's aggregate-then-fail. Save happens only after a file's translation fully succeeded, so cancellation or a crash never leaves a half-written subtitle: the unit of atomicity is the file.

### D3: Progress, cancellation, and the in-flight file

`TranslateProgress { index, total, fileName }` per file over the channel, behind the same `ProgressReporter` seam. Cancellation aborts the spawned task (match-style epoch + abort): dropping the in-flight `translate_subtitle` future cancels its pending HTTP request; because writes happen only after full success (D2), the abandoned file simply has no output, previously completed files keep theirs, and the epoch guard discards any late commit. This is stronger than convert's between-files-only cancel because translation's per-file cost (many AI round-trips) makes "finish the current file" an expensive courtesy — and unlike convert's file writes, aborting between AI batches corrupts nothing.

### D4: Overwrite is a plan-level toggle, blocked-by-default

The CLI refuses an existing suffix-mode output without `--force`; the GUI keeps that contract: existing outputs are flagged at preview and excluded from selection while the overwrite toggle is off; turning it on re-includes them. (Contrast documented in convert D3: convert's CLI overwrites silently, so its GUI merely flags — each wizard keeps its CLI's native semantics rather than inventing a uniform policy.) Replace mode ignores the toggle — replacing *is* overwriting, gated instead by the backup rule and the archive prohibition (`translate.replace_archive_forbidden`, mirroring the CLI's hard error, but as a per-item preview flag so one archive file does not kill a mixed batch).

Overwrite protection alone does not cover *intra-plan* collisions: the archive-origin rule sends every extracted file's output beside the archive, so an archive whose entries share a basename across subdirectories (`S01E01/subtitle.srt`, `S01E02/subtitle.srt` — a common layout) resolves multiple items to one output path, none of which may exist yet. Executing them all would silently last-write-win and still report every item as succeeded. The preview therefore marks all but the first item per resolved output path with `translate.output_collision` and excludes them, exactly as convert's plan does; the overwrite toggle does not re-include collisions (it answers "may I replace what's on disk", not "may these clobber each other").

### D5: Provider and config are resolved at execution start, through the test seam

`service.reload()` first, then the `AiProviderFactory` seam builds the provider once per run; `TranslationEngine::new(provider, translation.batch_size)`. A missing/invalid provider maps to `translate.ai_not_configured` with the Settings hint code — same UX contract as match's equivalent. The engine is constructed before the first file so a configuration problem fails the run in one step, not once per file. Target-language resolution mirrors the CLI's precedence (per-run value, else `translation.default_target_language`, else `translate.no_target_language`). The UI blocks first and blocks it *on the options step*, where the field lives: Step 2 prefills from the scan's `defaultTargetLanguage` and, while the effective language is still empty, shows `translate.no_target_language` with the next action disabled (D1). The backend keeps enforcing it because it is the boundary, not because the wizard relies on it for the message.

### D6: Error codes

Plan/flow: `translate.no_subtitles`, `translate.no_target_language`, `translate.stale_plan`, `translate.translation_in_progress`; item flags: `translate.output_exists` (with the overwrite toggle as the recovery path), `translate.output_collision` (intra-plan duplicate output, D4), `translate.replace_archive_forbidden`, `translate.unparsable` (preview-time parse failure); run-level: `translate.ai_not_configured` (hint → Settings). Per-item execution failures map through the shared `SubXError → core.<category>` conversion (`core.ai_service` for response-validation and rate-limit failures, etc.). The engine's empty-string fallback for cues missing after retry is surfaced as a per-item warning in the report (the outcome's counts make it detectable), not silently accepted.

## Risks / Trade-offs

- [AI cost scales with cue count and users may not anticipate it] → the preview's per-file cue counts and a total are shown before anything runs; execution starts only on explicit action. Terminology extraction adds one extra request per file — stated in the options-step copy.
- [Filesystem changes between preview and execution] → per-item failures are collected, not fatal; `outputExists` is a preview-time hint re-checked at write time in overwrite-off mode.
- [Mirrored output/backup rules can drift from the CLI] → confined to one function set with comments citing `translate_command.rs`; revisited on `subx-core` extraction.
- [A large file with many batches gives no visible progress movement] → the per-file label plus elapsed time keeps the UI honest; a crate-side progress hook is the real fix and is noted for `subx-core`, as match's D2 did.
- [Sequential per-file execution is slow for big batches] → matches CLI behavior and keeps provider rate-limit exposure predictable; parallelism is a future knob, not a v1 gamble.
- [Replace mode with backups off destroys the original on a bad translation] → the engine validates responses before any write (unknown-ID retry, placeholder checks), the write is post-success only (D2), and replace is opt-in behind an explicit choice; the report links what replaced what.

## Migration Plan

Not applicable — additive feature on an unreleased app.

## Open Questions

(none — glossary-file picking, translated-text review/editing, and parallel execution are explicitly deferred)
