# Design: add-match-wizard

## Context

The shell and settings changes established the thin command layer, `ErrorDto` codes, i18n, theming, `WizardShell`, and a configurable AI provider. This change wires the actual match flow to the `subx-cli` crate.

Relevant `subx-cli` APIs (consumed, not modified):

- `ComponentFactory::create_ai_provider()` (`src/core/factory.rs`) — builds the AI provider from the shared config. (`create_match_engine()` is NOT used: it hardcodes `relocation_mode: FileRelocationMode::None`, see D4.)
- `MatchEngine::new(ai_client, match_config)` + a manually constructed `MatchConfig` — the same pattern the CLI itself uses (`src/commands/match_command.rs`, `execute_with_client`).
- `MatchEngine::match_file_list_with_audit()` (`src/core/matcher/engine.rs`) — analysis producing `MatchOperation`s plus audit data. Internally it consults the crate's persistent file-list cache before calling the AI; on a cache hit, relocation fields are recomputed from the current engine config.
- `MatchEngine::execute_operations_audit()` — executes a given operation list WITHOUT aborting on per-item failure, returning `Vec<OperationOutcome>` (each with `OperationError { category, code, message }`). The non-audit `execute_operations()` aborts on first failure and is not suitable for the wizard's reporting requirements.
- `cli::input_handler::InputPathHandler` / `CollectedFiles` — expands folders, individual files, and archives (zip/7z/tar; rar behind a crate feature) and tracks each extracted file's `archive_origin()`. (`FileDiscovery` alone does NOT handle archives.)
- `apply_unique_target_paths()` (`src/core/matcher/engine.rs`, public) — global target-name uniqueness pass, run after any post-analysis relocation rewrites.

Key user-facing constraints from brainstorming: multiple heterogeneous sources; one video may match several subtitles (multi-language) or none; v1 review is checkbox accept/exclude only (no manual re-assignment).

## Goals / Non-Goals

**Goals:**

- Four-step wizard: Sources (incl. relocation mode choice) → Analysis → Review → Execute & Report, on `WizardShell`.
- Backend-owned plan state; frontend references operations by ID.
- Cancellable analysis with stage-level progress events.
- Selective execution with per-item success/failure reporting.

**Non-Goals:**

- No manual match re-assignment (dragging a subtitle to a different video) — explicitly deferred; the review step's grouped layout leaves room for it.
- No GUI-owned persistence of plans: a GUI session's plan lives in memory only. Note the crate itself keeps a persistent file-list match cache (shared with the CLI) that `match_file_list_with_audit()` consults transparently; the GUI embraces it (see D2/D4) but adds no cache of its own and no history UI.
- No parallel multi-folder batch orchestration beyond what a single engine run handles.

## Decisions

### D1: Plan state lives in Tauri managed state, keyed by plan ID

`analyze_sources` stores the full `Vec<MatchOperation>` + the step-1 `CollectedFiles` in a `tokio::sync::Mutex` holding a single active plan (v1) and returns a display `MatchPlanDto` carrying the plan ID. `execute_selected(plan_id, operation_ids)` retrieves the canonical operations and passes exactly the selected subset to `execute_operations_audit()`. Rationale: rich Rust types never round-trip through JS, and selective execution is a simple ID filter (the DTO `id` is the operation's index in the stored `Vec`). A new analysis invalidates prior plans; executing against a stale/unknown plan ID yields `match.stale_plan` so the UI restarts the wizard cleanly. The mutex is `tokio::sync::Mutex` because writers hold it around `.await` points in the spawned analysis task.

Two ownership/ordering constraints matter for execution. **The `CollectedFiles` owns the archive-extraction temp dirs, so execution takes ownership of it and holds it across the `execute_operations_audit().await`** — an archive-sourced operation copies from a path inside a temp dir, and dropping the `CollectedFiles` early (e.g. by handing execution only the engine + operations) deletes that source before the copy runs. **The process-global journal lock (D8) is acquired *before* the plan is consumed**, not after: if lock acquisition times out because another subx process is busy, the plan must survive so the user can retry rather than being forced back to a full re-analysis.

### D2: Stage-level progress over a per-invocation Channel, not per-file progress

`MatchEngine` exposes no progress callback, so the command layer reports what it truthfully knows as three stages: `scanning` (source expansion), `analyzing` (the `match_file_list_with_audit()` call — which may resolve near-instantly on a crate cache hit without any AI request; the neutral label keeps the UI honest either way), `finalizing` (DTO assembly). The UI presents these as an animated staged indicator, not a percentage. If a future `subx-core` exposes hooks, only the command layer changes.

Progress travels over a **`tauri::ipc::Channel<MatchProgress>`** the frontend passes into `analyze_sources`, not a `tauri_specta::Event`. `add-typed-ipc-bindings` locked in a single runtime-generic `specta_builder<R>` that both the app (`Wry`) and the IPC tests (`MockRuntime`) register from. Emitting a `tauri_specta::Event` requires an `AppHandle<R>` in the command signature, which forces the command generic over `R` — and `collect_commands!` cannot infer `R` for a generic command inside that generic builder (the macro rejects it, `E0283`/`E0401`). A `Channel` is runtime-agnostic, so the command stays non-generic and registrable, and progress is naturally scoped to the one analysis that owns the channel rather than broadcast on a global bus. The command layer abstracts the sink behind a small `ProgressReporter` trait so the analysis logic is testable without a live channel. (This supersedes the original plan, carried in `add-typed-ipc-bindings`'s notes, of adding `match-progress` to `collect_events!`; that collection stays wired empty for a future event emitted from a non-command site.)

### D3: Cancellation via tokio task abort, epoch-guarded against a commit race

The analysis runs in a spawned tokio task whose `AbortHandle` is stored in state; `cancel_analysis` aborts it and clears the pending plan. Aborting mid-AI-request drops the HTTP future — safe because analysis mutates no media files. The UI returns to Step 1. While an analysis is in flight, a second `analyze_sources` call is rejected with `match.analysis_in_progress`.

Two correctness details the naive version gets wrong:

- **The single-analysis slot is reserved *before* the task is spawned** (a boolean set under the state lock), not after. Spawning first and aborting the loser on contention lets that loser task reach the AI request on a multi-thread runtime before the cooperative abort is observed — a wasted, possibly billed call. Reserving first means a losing caller never spawns.
- **A cancel that lands after the task finished but before its plan is stored must still discard the plan.** State carries an `epoch` that `cancel` bumps; the analysis captures its epoch when it reserves the slot and commits its plan only if the epoch is unchanged (`commit_plan(epoch, plan)`). Without this, a cancel in that window is a no-op and the plan the user discarded resurfaces in Review. The frontend mirrors this with a per-call generation ref: `cancel` and each new `analyze` bump it, and the analysis applies its result (and its progress messages) only while its generation is still current — so a late-resolving cancelled or superseded analysis updates nothing.

### D4: Relocation mode is chosen in Step 1 and baked into analysis

`FileRelocationMode` is consumed at ANALYSIS time: `match_file_list_with_audit()` bakes `relocation_mode` / `relocation_target_path` / `requires_relocation` into each produced `MatchOperation`, and `execute_operations_audit()` branches on those per-operation fields — not on the executing engine's config. Therefore the wizard collects the relocation choice (rename in place / copy / move; default rename) as part of Step 1, and `analyze_sources` builds the engine via `MatchEngine::new(create_ai_provider()?, match_config)` with a manually constructed `MatchConfig` carrying that mode plus the config-derived fields, mirroring the CLI's own `execute_with_client`. Benefits: the Review step can display exact target paths, and execution is a pure "run the reviewed plan".

Changing the mode after review means going back to Step 1 and re-analyzing — which is cheap: the crate's persistent file-list cache makes re-analysis of an unchanged file set a cache hit (no AI call) and recomputes relocation fields from the new mode.

The alternative — choosing the mode at Step 4 and rewriting the stored operations' relocation fields in the command layer — was rejected: it would duplicate the engine's target-path computation in the GUI (drift risk) and make the reviewed plan differ from the executed one.

### D5: Post-analysis archive-origin rewrite, then uniqueness pass

Mirroring the CLI (`match_command.rs`): after analysis, for every operation whose subtitle came out of an archive (`CollectedFiles::archive_origin()`) and that does not already relocate, the command layer forces a copy targeting the video's directory (otherwise the output would land in the temp extraction dir), then runs the public `apply_unique_target_paths()` over all operations. This is a deliberate, contained duplication of the CLI's own post-analysis pattern — the crate offers no single API that performs it — and is confined to `commands/match.rs`.

### D6: Unmatched sections are computed by set difference

`MatchAudit.rejected` only lists AI-proposed-but-rejected candidates (and is empty on cache hits); it is NOT a complete unmatched list. The command layer therefore computes: unmatched videos = (videos in the step-1 scan) − (videos referenced by any operation); unmatched subtitles = (subtitles in the scan) − (subtitles referenced by any operation). Rejected candidates, when present, additionally annotate why a pairing was declined. `MatchPlanDto` carries both unmatched lists explicitly.

### D7: Review presentation is video-grouped with explicit unmatched sections

`MatchPlanDto` groups operations under their video; videos with at least one match appear in the grouped list (multi-language matches as children of one video row, each with target path, confidence, and verbatim AI reasoning), while zero-match videos appear ONLY in the unmatched-videos section. All operations start selected; executing with an empty selection is blocked in the UI.

### D8: Failures map to actionable error codes

Representative mappings: missing/invalid AI configuration → `match.ai_not_configured` with hint code linking the UI to Settings; AI timeout/rate limit → `match.ai_unavailable` with retry affordance; no videos or no subtitles found → `match.sources_insufficient` surfaced at Step 1's scan preview; in-flight analysis → `match.analysis_in_progress`; unknown/replaced plan → `match.stale_plan`; the shared journal lock held by another subx process → `match.execution_locked`, a distinct code so the UI offers a plain retry (the plan is untouched) rather than a dead-end error. Per-item execution failures arrive as `OperationOutcome`/`OperationError` data in `ExecutionReportDto`, are mapped to the shared `core.<category>` codes, and render in the final report without aborting the run.

## Risks / Trade-offs

- [Filesystem changes between analysis and execution make operations stale] → `execute_operations_audit()` reports per-item errors and continues; report copy suggests re-running analysis.
- [Crate cache hit returns previously computed matches without a fresh AI call] → acceptable and often desirable (fast, free); relocation fields are recomputed from the current mode on cache hits, so correctness is unaffected. The neutral "analyzing" stage label avoids claiming an AI request that didn't happen.
- [Large source trees generate large AI prompts and cost] → Step 1 scan preview shows counted files before any AI call; analysis starts only on explicit user action.
- [Engine stdout/stderr prints are invisible in GUI] → acceptable; structured results carry all needed data.
- [Single active plan may surprise users navigating back mid-flow] → wizard state machine treats "back past Analysis" as plan invalidation with a confirm dialog.
- [Archive-origin rewrite duplicates ~15 lines of CLI logic] → contained in one function with a comment pointing at the CLI source; revisited when `subx-core` is extracted.

## Migration Plan

Not applicable — additive feature on an unreleased app.

## Open Questions

(none — v1 scope was settled during brainstorming; manual re-assignment intentionally deferred and will be a separate proposal, likely paired with a `subx-cli`/`subx-core` plan-apply API discussion)
