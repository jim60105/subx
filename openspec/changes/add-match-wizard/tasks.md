# Tasks: add-match-wizard

## 1. Backend — Plan State & DTOs

- [ ] 1.1 Declare `tokio = { version = "1", features = ["sync"] }` in `src-tauri/Cargo.toml` — it is currently only a transitive dependency of `tauri`, so `use tokio::sync::Mutex` will not resolve — then add `PlanState` storage to `state.rs`as `tokio::sync::Mutex<HashMap<PlanId, PlanState>>` holding `Vec<MatchOperation>`, audit data, and the step-1 `CollectedFiles` (for `archive_origin()` lookups), plus the running-analysis `JoinHandle`; new analysis invalidates prior plans
- [ ] 1.2 Define DTOs in `dto.rs`: `SourceScanResult`, `MatchPlanDto` (video-grouped operations with IDs, target paths, confidence, reasoning; unmatched videos/subtitles lists), `ExecutionReportDto` (from `Vec<OperationOutcome>`). **No TypeScript mirrors** — `add-typed-ipc-bindings` has landed, so each type derives `specta::Type` and its declaration is generated into `src/types/bindings.ts`; hand-writing one would be caught by that change's drift gate and the raw-`invoke` lint. Two constraints that change apply to every new DTO: no 64-bit integer may cross the boundary (specta rejects `u64`/`i64` as lossy in JavaScript — use `u32`, or a string for anything genuinely large), and `#[serde(skip_serializing_if)]` is unavailable (it is incompatible with the unified serde mode the bindings use), so an absent value travels as an explicit `null`
- [ ] 1.2a Declare `match-progress` through `tauri_specta::Event` and add it to the builder's `collect_events![…]` in `bindings.rs`, rather than defining a hand-written payload type — the empty collection is already wired for exactly this
- [ ] 1.3 Extend `error.rs` with match error codes (`match.ai_not_configured`, `match.ai_unavailable`, `match.sources_insufficient`, `match.analysis_in_progress`, `match.stale_plan`, per-item execution failure codes mapped from `OperationError`) and their `en`/`zh-TW` strings

## 2. Backend — Commands

- [ ] 2.1 Implement `list_source_files(paths)` using `InputPathHandler`/`CollectedFiles` (folders, files, archives — NOT bare `FileDiscovery`, which has no archive support) returning `SourceScanResult`
- [ ] 2.2 Implement `analyze_sources(paths, relocation_mode)` as a spawned tokio task: build `MatchConfig` manually with the chosen `FileRelocationMode` (mirroring the CLI's `execute_with_client`; `ComponentFactory::create_match_engine()` hardcodes `None` and cannot be used), create the engine via `MatchEngine::new(create_ai_provider()?, match_config)`, call `match_file_list_with_audit()`, emit `match-progress` events (`scanning`/`analyzing`/`finalizing`), store the plan, return `MatchPlanDto`; reject with `match.analysis_in_progress` if a task is already running
- [ ] 2.3 After analysis, apply the archive-origin rewrite (force copy to the video's directory for operations whose subtitle has an `archive_origin()` and no relocation yet, mirroring `match_command.rs`) and then run `apply_unique_target_paths()` before storing the plan
- [ ] 2.4 Compute `unmatched_videos`/`unmatched_subtitles` by set difference against the scan result (operations ∪ rejected do not cover files the AI never mentioned; `rejected` is empty on cache hits)
- [ ] 2.5 Implement `cancel_analysis()` aborting the stored task and clearing the pending plan
- [ ] 2.6 Implement `execute_selected(plan_id, operation_ids)`: reject stale/unknown plan IDs with `match.stale_plan`, run `execute_operations_audit()` (NOT `execute_operations()`, which aborts on first failure) on the selected subset, build `ExecutionReportDto` from the outcomes
- [ ] 2.7a Register every new command in `bindings.rs`'s single `collect_commands![…]` — not in a `tauri::generate_handler!`, which a guard test now rejects outright — and add each one to `ipc_tests.rs`'s `COMMANDS` allowlist, since the mock runtime starts with an empty ACL and denies anything unlisted
- [ ] 2.7 Backend tests with `TestConfigService` + `wiremock` AI mock: full analyze→select→execute flow, relocation modes (incl. archive-origin forced copy), cancellation, concurrent-analysis rejection, stale plan, unconfigured provider, per-item failure collection

## 3. Frontend — Wizard

- [ ] 3.1 Implement the wizard state machine (step transitions, plan invalidation with confirm when navigating back past Analysis) inside `WizardShell`; wire the home hub's Match card to it
- [ ] 3.2 Step 1 Sources: multi-source drag-and-drop + browse, source list management, relocation mode selector (default rename in place), scan preview via `list_source_files`, insufficient-sources blocking state
- [ ] 3.3 Step 2 Analysis: staged progress indicator driven by `match-progress` events, cancel button, error states (not configured → link to Settings; unavailable → retry)
- [ ] 3.4 Step 3 Review: video-grouped operation list (videos with ≥1 match only) with target paths, confidence, and expandable reasoning; unmatched videos/subtitles sections; select-all default with per-operation checkboxes
- [ ] 3.5 Step 4 Execute: plan summary (selected count + mode), execute action disabled on empty selection, per-item outcome report with success/failure styling
- [ ] 3.6 Add `match` locale namespace with complete `en` and `zh-TW` strings

## 4. Tests & Verification

- [ ] 4.1 Component tests (IPC mocked): state machine transitions, selection logic (incl. empty-selection disable), unmatched rendering, progress event handling, stale-plan recovery
- [ ] 4.2 Manual end-to-end verification with a real media folder and a local LLM (Ollama): mixed sources incl. an archive, multi-language matches, deselection, copy mode, mode change via back-navigation (should hit the crate cache), induced per-item failure
- [ ] 4.3 `cargo test`, `npm test`, `cargo clippy`, `tsc --noEmit` all clean
