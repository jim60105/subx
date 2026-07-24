//! Match wizard commands.
//!
//! The end-to-end GUI match flow, wrapping the `subx-cli` crate's
//! `MatchEngine`: scan sources, run a cancellable AI analysis, hold the plan
//! canonically in backend state, and execute a reviewed subset with per-item
//! reporting. Like every command module this is a thin translation layer — the
//! matching logic all lives in the crate.
//!
//! Two seams keep the flow testable despite depending on a live AI and a Tauri
//! progress `Channel`. [`AiProviderFactory`] lets a test inject a scripted
//! `AIProvider` (the crate assigns file IDs at scan time, so a static HTTP mock
//! cannot echo the IDs a match must reference), and [`ProgressReporter`]
//! abstracts the progress sink so the analysis logic can run without a channel.
//! The `#[tauri::command]` wrappers supply the production implementations of both.

use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use subx_cli::cli::{CollectedFiles, InputPathHandler};
use subx_cli::config::ConfigService;
use subx_cli::core::matcher::engine::{
    apply_unique_target_paths, ConflictResolution, FileRelocationMode, MatchConfig, OperationError,
    OperationOutcome,
};
use subx_cli::core::lock::acquire_subx_lock;
use subx_cli::core::matcher::{FileDiscovery, MatchEngine, MatchOperation, MediaFileType};
use subx_cli::core::ComponentFactory;
use subx_cli::error::SubXError;
use subx_cli::services::ai::AIProvider;
use tauri::ipc::Channel;
use tauri::State;

use crate::dto::{
    ExecutionOutcomeDto, ExecutionReportDto, MatchOperationDto, MatchPlanDto, MatchProgress,
    MatchStage, MatchedVideoDto, RelocationModeDto, SourceScanResult,
};
use crate::error::ErrorDto;
use crate::state::{ActivePlan, AppState, MatchState};

/// Default match confidence threshold, as a whole percentage.
///
/// The CLI takes this from a `--confidence` flag (default 80); the wizard has
/// no such control in v1, so it uses the same default.
const DEFAULT_CONFIDENCE: u8 = 80;

// Stable error codes the frontend localizes (design D8). Kept as literals so
// `backendCodeParity.test.ts` can find them and demand `en`/`zh-TW` strings.
const CODE_AI_NOT_CONFIGURED: &str = "match.ai_not_configured";
const CODE_AI_UNAVAILABLE: &str = "match.ai_unavailable";
const CODE_SOURCES_INSUFFICIENT: &str = "match.sources_insufficient";
const CODE_ANALYSIS_IN_PROGRESS: &str = "match.analysis_in_progress";
const CODE_ANALYSIS_CANCELLED: &str = "match.analysis_cancelled";
const CODE_STALE_PLAN: &str = "match.stale_plan";
const CODE_EXECUTION_LOCKED: &str = "match.execution_locked";

const HINT_AI_NOT_CONFIGURED: &str = "match.ai_not_configured.hint";
const HINT_AI_UNAVAILABLE: &str = "match.ai_unavailable.hint";
const HINT_SOURCES_INSUFFICIENT: &str = "match.sources_insufficient.hint";
const HINT_STALE_PLAN: &str = "match.stale_plan.hint";
const HINT_EXECUTION_LOCKED: &str = "match.execution_locked.hint";

/// A scanned media file as `(canonical path, display name)`. The path is the
/// identity used for the unmatched set difference; the name is what the UI shows.
type ScannedFile = (PathBuf, String);

// ─── Command wrappers ───────────────────────────────────────────────────────
// Two lines each: translate DTOs, supply the production seams, delegate.

/// Scans the given sources and returns the video/subtitle counts for the Step 1
/// preview. Empty counts are a valid result the UI blocks on, not an error.
#[tauri::command]
#[specta::specta]
pub async fn list_source_files(paths: Vec<String>) -> Result<SourceScanResult, ErrorDto> {
    scan_sources(&to_paths(&paths))
}

/// Runs a cancellable AI analysis over the sources with the chosen relocation
/// mode, pushing staged progress over `on_progress`, and returns the plan.
#[tauri::command]
#[specta::specta]
pub async fn analyze_sources(
    paths: Vec<String>,
    relocation_mode: RelocationModeDto,
    on_progress: Channel<MatchProgress>,
    state: State<'_, AppState>,
) -> Result<MatchPlanDto, ErrorDto> {
    analyze_sources_impl(
        state.config_service_arc(),
        state.match_state(),
        Arc::new(ProductionAiFactory),
        Arc::new(ChannelReporter::new(on_progress)),
        to_paths(&paths),
        relocation_mode,
    )
    .await
}

/// Aborts a running analysis and discards the pending plan (design D3).
#[tauri::command]
#[specta::specta]
pub async fn cancel_analysis(state: State<'_, AppState>) -> Result<(), ErrorDto> {
    state.match_state().cancel().await;
    Ok(())
}

/// Executes exactly the selected operations of a plan and reports each outcome.
#[tauri::command]
#[specta::specta]
pub async fn execute_selected(
    plan_id: String,
    operation_ids: Vec<u32>,
    state: State<'_, AppState>,
) -> Result<ExecutionReportDto, ErrorDto> {
    execute_selected_impl(state.match_state(), &plan_id, &operation_ids).await
}

// ─── Seams ──────────────────────────────────────────────────────────────────

/// Builds the AI provider for an analysis. Injected so tests can script one.
pub trait AiProviderFactory: Send + Sync {
    fn create_provider(&self, service: &dyn ConfigService) -> Result<Box<dyn AIProvider>, ErrorDto>;
}

/// The production factory: builds the provider from the shared config.
struct ProductionAiFactory;

impl AiProviderFactory for ProductionAiFactory {
    fn create_provider(&self, service: &dyn ConfigService) -> Result<Box<dyn AIProvider>, ErrorDto> {
        // Reload first: the user may have just configured the provider on the
        // Settings screen, and `ProductionConfigService` caches the file.
        service.reload().map_err(ErrorDto::from)?;
        let factory = ComponentFactory::new(service).map_err(map_provider_error)?;
        factory.create_ai_provider().map_err(map_provider_error)
    }
}

/// Reports analysis progress. Injected so the logic runs without an `AppHandle`.
pub trait ProgressReporter: Send + Sync {
    fn report(&self, stage: MatchStage);
}

/// The production reporter: pushes progress over the invocation's `Channel`.
///
/// `Channel` is runtime-agnostic, so unlike a `tauri_specta::Event` it needs no
/// generic `AppHandle<R>` and keeps `analyze_sources` registrable in the one
/// generic `specta_builder` (see `MatchProgress`).
struct ChannelReporter {
    channel: Channel<MatchProgress>,
}

impl ChannelReporter {
    fn new(channel: Channel<MatchProgress>) -> Self {
        Self { channel }
    }
}

impl ProgressReporter for ChannelReporter {
    fn report(&self, stage: MatchStage) {
        // Progress is best-effort: a failed send must not fail the analysis.
        let _ = self.channel.send(MatchProgress { stage });
    }
}

// ─── Implementations ────────────────────────────────────────────────────────

/// Scans sources into video/subtitle counts.
fn scan_sources(paths: &[PathBuf]) -> Result<SourceScanResult, ErrorDto> {
    let collected = collect_input_files(paths)?;
    let (videos, subtitles) = classify(&collected)?;
    Ok(SourceScanResult {
        video_count: videos.len() as u32,
        subtitle_count: subtitles.len() as u32,
    })
}

/// Orchestrates one analysis: guard, spawn, await, store, build the DTO.
///
/// The work runs in a spawned task so `cancel_analysis` can abort it mid-flight
/// (design D3). The task's `AbortHandle` is claimed under the state lock before
/// the await, which is what makes the single-analysis guard race-free.
async fn analyze_sources_impl(
    service: Arc<dyn ConfigService>,
    match_state: Arc<MatchState>,
    factory: Arc<dyn AiProviderFactory>,
    reporter: Arc<dyn ProgressReporter>,
    paths: Vec<PathBuf>,
    mode: RelocationModeDto,
) -> Result<MatchPlanDto, ErrorDto> {
    let reloc = to_relocation_mode(&mode);

    // Reserve the slot *before* spawning, so a losing concurrent caller never
    // runs `run_analysis` (and never issues an AI request). The epoch pins this
    // analysis so a `cancel` during finalization discards its plan.
    let epoch = match match_state.try_begin_analysis().await {
        Ok(epoch) => epoch,
        Err(()) => return Err(analysis_in_progress()),
    };
    let task = tokio::spawn(run_analysis(service, factory, reporter, paths, reloc));
    match_state.set_running(task.abort_handle()).await;

    let product = match task.await {
        Ok(Ok(product)) => product,
        Ok(Err(err)) => {
            match_state.finish_analysis().await;
            return Err(err);
        }
        // `cancel_analysis` aborted us; it already released the slot and bumped
        // the epoch. The frontend has returned to Step 1 and ignores this.
        Err(join) if join.is_cancelled() => return Err(analysis_cancelled()),
        Err(_) => {
            match_state.finish_analysis().await;
            return Err(ErrorDto::new("core.other", "the analysis task panicked"));
        }
    };

    let plan = ActivePlan::new(product.engine, product.operations, product.collected);
    let dto = build_plan_dto(
        plan.id(),
        mode,
        plan.operations(),
        &product.scanned_videos,
        &product.scanned_subtitles,
    );
    // Commit only if no cancel intervened while we were finalizing; otherwise
    // the plan the user discarded must not resurface in Review.
    if match_state.commit_plan(epoch, plan).await {
        Ok(dto)
    } else {
        Err(analysis_cancelled())
    }
}

/// Everything the analysis produces, carried out of the spawned task.
struct AnalysisProduct {
    engine: MatchEngine,
    operations: Vec<MatchOperation>,
    /// Kept so archive-extraction temp dirs outlive analysis into execution.
    collected: CollectedFiles,
    scanned_videos: Vec<ScannedFile>,
    scanned_subtitles: Vec<ScannedFile>,
}

/// The cancellable analysis body: scan, build the engine, match, finalize.
async fn run_analysis(
    service: Arc<dyn ConfigService>,
    factory: Arc<dyn AiProviderFactory>,
    reporter: Arc<dyn ProgressReporter>,
    paths: Vec<PathBuf>,
    mode: FileRelocationMode,
) -> Result<AnalysisProduct, ErrorDto> {
    reporter.report(MatchStage::Scanning);
    let collected = collect_input_files(&paths)?;
    let (scanned_videos, scanned_subtitles) = classify(&collected)?;
    if scanned_videos.is_empty() || scanned_subtitles.is_empty() {
        return Err(sources_insufficient());
    }

    // Build the engine the way the CLI's `execute_with_client` does: a manual
    // `MatchConfig` carrying the chosen mode. `create_match_engine()` is unusable
    // — it hardcodes `relocation_mode: None`.
    let provider = factory.create_provider(service.as_ref())?;
    let config = service.get_config().map_err(ErrorDto::from)?;
    let match_config = MatchConfig {
        confidence_threshold: DEFAULT_CONFIDENCE as f32 / 100.0,
        max_sample_length: config.ai.max_sample_length,
        // Always on, matching the CLI: generates and caches content results.
        enable_content_analysis: true,
        backup_enabled: config.general.backup_enabled,
        relocation_mode: mode,
        conflict_resolution: ConflictResolution::AutoRename,
        ai_model: config.ai.model.clone(),
        max_subtitle_bytes: config.general.max_subtitle_bytes,
    };
    let engine = MatchEngine::new(provider, match_config);

    reporter.report(MatchStage::Analyzing);
    let file_paths: &[PathBuf] = &collected;
    let audit = engine
        .match_file_list_with_audit(file_paths)
        .await
        .map_err(map_analysis_error)?;
    let mut operations = audit.operations;

    reporter.report(MatchStage::Finalizing);
    rewrite_archive_origins(&mut operations, &collected);
    // Must run after the archive-origin rewrite so uniqueness holds at the
    // actual destinations (design D5).
    apply_unique_target_paths(&mut operations);

    Ok(AnalysisProduct {
        engine,
        operations,
        collected,
        scanned_videos,
        scanned_subtitles,
    })
}

/// Executes the selected subset of a plan's operations, reporting each outcome.
async fn execute_selected_impl(
    match_state: Arc<MatchState>,
    plan_id: &str,
    operation_ids: &[u32],
) -> Result<ExecutionReportDto, ErrorDto> {
    // Serialize journal writes with any concurrent CLI run: execution mutates
    // the shared `~/.config/subx/match_journal.json`, and the CLI takes this
    // same lock around its own live runs.
    //
    // Acquire the lock *before* consuming the plan. If acquisition times out
    // (another subx process is busy), the plan must survive so the user can
    // retry rather than being forced back to a full re-analysis.
    let _lock = acquire_subx_lock().await.map_err(|_| execution_locked())?;

    // Take the plan out only once the lock is held: a plan is executed once, and
    // consuming it here drops its engine and `CollectedFiles` when we return.
    let plan = match_state.take_plan_if(plan_id).await.ok_or_else(stale_plan)?;
    // `_collected` owns the archive-extraction temp dirs; it MUST stay in scope
    // across the execution `.await`, or an archive-sourced copy's source path is
    // deleted before the copy runs.
    let (engine, operations, _collected) = plan.into_execution();

    // `MatchOperation` is not `Clone`, so move the selected ops out by index
    // rather than copying. Indices are the DTO's `id`s, stable within a plan.
    let want: HashSet<usize> = operation_ids.iter().map(|&id| id as usize).collect();
    let selected: Vec<MatchOperation> = operations
        .into_iter()
        .enumerate()
        .filter(|(index, _)| want.contains(index))
        .map(|(_, op)| op)
        .collect();

    // Nothing selected is a no-op the UI already blocks; short-circuit rather
    // than driving the engine over an empty batch.
    if selected.is_empty() {
        return Ok(build_report(&selected, &[]));
    }

    // The audit variant continues past per-item failures (design D8); the plain
    // `execute_operations` aborts on the first.
    let outcomes = engine
        .execute_operations_audit(&selected, false)
        .await
        .map_err(ErrorDto::from)?;

    Ok(build_report(&selected, &outcomes))
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

fn to_paths(paths: &[String]) -> Vec<PathBuf> {
    paths.iter().map(PathBuf::from).collect()
}

fn to_relocation_mode(mode: &RelocationModeDto) -> FileRelocationMode {
    match mode {
        RelocationModeDto::Rename => FileRelocationMode::None,
        RelocationModeDto::Copy => FileRelocationMode::Copy,
        RelocationModeDto::Move => FileRelocationMode::Move,
    }
}

/// Expands folders, files and archives via the crate's input handler.
///
/// Uses `InputPathHandler`, not bare `FileDiscovery`, because only the former
/// extracts archives and records each extracted file's origin.
fn collect_input_files(paths: &[PathBuf]) -> Result<CollectedFiles, ErrorDto> {
    let handler = InputPathHandler::from_args(paths, true).map_err(ErrorDto::from)?;
    handler.collect_files().map_err(ErrorDto::from)
}

/// Splits the collected files into `(path, name)` videos and subtitles.
fn classify(
    collected: &CollectedFiles,
) -> Result<(Vec<ScannedFile>, Vec<ScannedFile>), ErrorDto> {
    let file_paths: &[PathBuf] = collected;
    let media = FileDiscovery::new()
        .scan_file_list(file_paths)
        .map_err(ErrorDto::from)?;

    let mut videos = Vec::new();
    let mut subtitles = Vec::new();
    for file in media {
        let entry = (file.path, file.name);
        match file.file_type {
            MediaFileType::Video => videos.push(entry),
            MediaFileType::Subtitle => subtitles.push(entry),
        }
    }
    Ok((videos, subtitles))
}

/// Forces archive-extracted subtitles to copy into the video's directory.
///
/// Mirrors `match_command.rs`: without this a matched subtitle that came out of
/// an archive would be renamed inside the temporary extraction directory rather
/// than landing next to its video (design D5).
fn rewrite_archive_origins(operations: &mut [MatchOperation], collected: &CollectedFiles) {
    for op in operations.iter_mut() {
        if collected.archive_origin(&op.subtitle_file.path).is_some() && !op.requires_relocation {
            if let Some(video_dir) = op.video_file.path.parent() {
                op.relocation_target_path = Some(video_dir.join(&op.new_subtitle_name));
                op.requires_relocation = true;
                op.relocation_mode = FileRelocationMode::Copy;
            }
        }
    }
}

/// Groups operations under their video and computes the unmatched sets.
///
/// Unmatched sets are a set difference against the full scan by path, not a
/// read of the AI's rejected candidates — which are empty on a cache hit and
/// never mention a file the AI ignored (design D6).
fn build_plan_dto(
    plan_id: &str,
    mode: RelocationModeDto,
    operations: &[MatchOperation],
    scanned_videos: &[ScannedFile],
    scanned_subtitles: &[ScannedFile],
) -> MatchPlanDto {
    let mut order: Vec<PathBuf> = Vec::new();
    let mut names: HashMap<PathBuf, String> = HashMap::new();
    let mut groups: HashMap<PathBuf, Vec<MatchOperationDto>> = HashMap::new();
    let mut matched_videos: HashSet<PathBuf> = HashSet::new();
    let mut matched_subtitles: HashSet<PathBuf> = HashSet::new();

    for (index, op) in operations.iter().enumerate() {
        let video_path = op.video_file.path.clone();
        if !groups.contains_key(&video_path) {
            order.push(video_path.clone());
            names.insert(video_path.clone(), op.video_file.name.clone());
        }
        groups
            .entry(video_path)
            .or_default()
            .push(MatchOperationDto {
                id: index as u32,
                subtitle_name: op.subtitle_file.name.clone(),
                target_path: display_target(op),
                confidence: (op.confidence.clamp(0.0, 1.0) * 100.0).round() as u32,
                reasoning: op.reasoning.clone(),
            });
        matched_videos.insert(op.video_file.path.clone());
        matched_subtitles.insert(op.subtitle_file.path.clone());
    }

    let videos = order
        .into_iter()
        .map(|video_path| MatchedVideoDto {
            video_name: names.get(&video_path).cloned().unwrap_or_default(),
            matches: groups.remove(&video_path).unwrap_or_default(),
        })
        .collect();

    MatchPlanDto {
        plan_id: plan_id.to_string(),
        relocation_mode: mode,
        videos,
        unmatched_videos: unmatched_names(scanned_videos, &matched_videos),
        unmatched_subtitles: unmatched_names(scanned_subtitles, &matched_subtitles),
    }
}

/// Names of scanned files not referenced by any operation (compared by path).
fn unmatched_names(scanned: &[ScannedFile], matched: &HashSet<PathBuf>) -> Vec<String> {
    scanned
        .iter()
        .filter(|(path, _)| !matched.contains(path))
        .map(|(_, name)| name.clone())
        .collect()
}

/// Builds the per-item execution report from the outcomes.
fn build_report(selected: &[MatchOperation], outcomes: &[OperationOutcome]) -> ExecutionReportDto {
    let mut items = Vec::with_capacity(selected.len());
    let mut success_count = 0u32;
    let mut failure_count = 0u32;

    for (op, outcome) in selected.iter().zip(outcomes.iter()) {
        let error = outcome.error.as_ref().map(operation_error_to_dto);
        if outcome.applied {
            success_count += 1;
        } else if error.is_some() {
            failure_count += 1;
        }
        items.push(ExecutionOutcomeDto {
            subtitle_name: op.subtitle_file.name.clone(),
            target_path: display_target(op),
            applied: outcome.applied,
            error,
        });
    }

    ExecutionReportDto {
        outcomes: items,
        success_count,
        failure_count,
    }
}

/// The path a subtitle will end up at, for display in the review and report.
fn display_target(op: &MatchOperation) -> String {
    let path = op.relocation_target_path.clone().unwrap_or_else(|| {
        let parent = op.subtitle_file.path.parent().unwrap_or_else(|| Path::new("."));
        parent.join(&op.new_subtitle_name)
    });
    path.display().to_string()
}

// ─── Error mapping ──────────────────────────────────────────────────────────

/// Provider construction only fails on configuration problems (unsupported
/// provider, missing key or model), all pointing the user at Settings.
fn map_provider_error(err: SubXError) -> ErrorDto {
    ErrorDto::new(CODE_AI_NOT_CONFIGURED, err.to_string()).with_hint(HINT_AI_NOT_CONFIGURED)
}

/// AI-transport failures get a retry affordance; anything else keeps the honest
/// generic `core.<category>` mapping.
fn map_analysis_error(err: SubXError) -> ErrorDto {
    match err.category() {
        "ai_service" | "api" => {
            ErrorDto::new(CODE_AI_UNAVAILABLE, err.to_string()).with_hint(HINT_AI_UNAVAILABLE)
        }
        _ => ErrorDto::from(err),
    }
}

/// A per-item execution failure, mapped to the shared `core.<category>` codes so
/// it localizes through the same path as any other error.
fn operation_error_to_dto(err: &OperationError) -> ErrorDto {
    ErrorDto::new(format!("core.{}", err.category), err.message.clone())
}

fn sources_insufficient() -> ErrorDto {
    ErrorDto::new(
        CODE_SOURCES_INSUFFICIENT,
        "sources must include at least one video and one subtitle",
    )
    .with_hint(HINT_SOURCES_INSUFFICIENT)
}

fn analysis_in_progress() -> ErrorDto {
    ErrorDto::new(CODE_ANALYSIS_IN_PROGRESS, "an analysis is already running")
}

fn analysis_cancelled() -> ErrorDto {
    ErrorDto::new(CODE_ANALYSIS_CANCELLED, "the analysis was cancelled")
}

fn stale_plan() -> ErrorDto {
    ErrorDto::new(CODE_STALE_PLAN, "the plan was replaced by a newer analysis")
        .with_hint(HINT_STALE_PLAN)
}

/// The shared journal lock could not be acquired — another subx process (the
/// CLI, or another window) is mid-execution. Distinct from a hard failure so the
/// UI can offer a plain retry; the plan is untouched.
fn execution_locked() -> ErrorDto {
    ErrorDto::new(CODE_EXECUTION_LOCKED, "another subx operation holds the lock")
        .with_hint(HINT_EXECUTION_LOCKED)
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::fs;
    use std::io::Write;
    use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
    use std::sync::Mutex;

    use async_trait::async_trait;
    use subx_cli::config::TestConfigService;
    use subx_cli::core::matcher::{MediaFile, MediaFileType};
    use subx_cli::services::ai::{
        AnalysisRequest, ConfidenceScore, FileMatch, MatchResult, VerificationRequest,
    };
    use tauri::ipc::Channel;
    use tempfile::TempDir;

    use super::*;

    // ─── Test doubles ───────────────────────────────────────────────────────

    /// Pairs every subtitle with the first video, echoing the IDs the engine
    /// assigned at scan time — the seam a static HTTP mock cannot fill, because
    /// those IDs are random and generated inside `match_file_list_with_audit`.
    struct ScriptedAi;

    #[async_trait]
    impl AIProvider for ScriptedAi {
        async fn analyze_content(&self, request: AnalysisRequest) -> subx_cli::Result<MatchResult> {
            let video_id = parse_entry_id(&request.video_files[0]);
            let matches = request
                .subtitle_files
                .iter()
                .map(|entry| FileMatch {
                    video_file_id: video_id.clone(),
                    subtitle_file_id: parse_entry_id(entry),
                    confidence: 0.95,
                    match_factors: vec!["scripted".to_string()],
                    language: None,
                    target_filename_suffix: None,
                })
                .collect();
            Ok(MatchResult {
                matches,
                confidence: 0.95,
                reasoning: "scripted".to_string(),
            })
        }

        async fn verify_match(
            &self,
            _verification: VerificationRequest,
        ) -> subx_cli::Result<ConfidenceScore> {
            unimplemented!("the match flow never verifies")
        }
    }

    /// Extracts the crate-assigned id from an `"ID:<id> | Name:… | Path:…"` entry.
    fn parse_entry_id(entry: &str) -> String {
        entry
            .strip_prefix("ID:")
            .and_then(|rest| rest.split(" |").next())
            .unwrap_or("")
            .trim()
            .to_string()
    }

    /// A provider that never analyzes; execution never calls the AI.
    struct NoAi;

    #[async_trait]
    impl AIProvider for NoAi {
        async fn analyze_content(&self, _r: AnalysisRequest) -> subx_cli::Result<MatchResult> {
            unimplemented!("execution never analyzes")
        }
        async fn verify_match(&self, _v: VerificationRequest) -> subx_cli::Result<ConfidenceScore> {
            unimplemented!("execution never verifies")
        }
    }

    struct ScriptedAiFactory;
    impl AiProviderFactory for ScriptedAiFactory {
        fn create_provider(
            &self,
            _service: &dyn ConfigService,
        ) -> Result<Box<dyn AIProvider>, ErrorDto> {
            Ok(Box::new(ScriptedAi))
        }
    }

    /// A factory that fails exactly as `create_ai_provider` does with no config.
    struct UnconfiguredAiFactory;
    impl AiProviderFactory for UnconfiguredAiFactory {
        fn create_provider(
            &self,
            _service: &dyn ConfigService,
        ) -> Result<Box<dyn AIProvider>, ErrorDto> {
            Err(map_provider_error(SubXError::config("no provider configured")))
        }
    }

    #[derive(Default)]
    struct RecordingReporter {
        stages: Mutex<Vec<MatchStage>>,
    }
    impl ProgressReporter for RecordingReporter {
        fn report(&self, stage: MatchStage) {
            self.stages.lock().unwrap().push(stage);
        }
    }
    impl RecordingReporter {
        fn stages(&self) -> Vec<MatchStage> {
            self.stages.lock().unwrap().clone()
        }
    }

    // ─── Builders ───────────────────────────────────────────────────────────

    fn configured_service() -> Arc<dyn ConfigService> {
        Arc::new(TestConfigService::with_ai_settings_and_key(
            "openai",
            "gpt-4.1-mini",
            "sk-test-value-1234",
        ))
    }

    fn match_config(mode: FileRelocationMode) -> MatchConfig {
        MatchConfig {
            confidence_threshold: 0.5,
            max_sample_length: 1000,
            enable_content_analysis: false,
            backup_enabled: false,
            relocation_mode: mode,
            conflict_resolution: ConflictResolution::AutoRename,
            ai_model: "test".to_string(),
            max_subtitle_bytes: 1_000_000,
        }
    }

    fn no_ai_engine(mode: FileRelocationMode) -> MatchEngine {
        MatchEngine::new(Box::new(NoAi), match_config(mode))
    }

    fn media(path: &Path, file_type: MediaFileType) -> MediaFile {
        let name = path
            .file_name()
            .map(|n| n.to_string_lossy().to_string())
            .unwrap_or_default();
        MediaFile {
            id: format!("file_{}", path.display()),
            path: path.to_path_buf(),
            file_type,
            size: 0,
            name: name.clone(),
            extension: path
                .extension()
                .map(|e| e.to_string_lossy().to_string())
                .unwrap_or_default(),
            relative_path: name,
        }
    }

    /// A rename-in-place operation (no relocation) over real files.
    fn rename_op(video: &Path, subtitle: &Path, new_name: &str) -> MatchOperation {
        MatchOperation {
            video_file: media(video, MediaFileType::Video),
            subtitle_file: media(subtitle, MediaFileType::Subtitle),
            new_subtitle_name: new_name.to_string(),
            confidence: 0.9,
            reasoning: vec!["reason".to_string()],
            relocation_mode: FileRelocationMode::None,
            relocation_target_path: None,
            requires_relocation: false,
        }
    }

    const SRT: &str = "1\n00:00:01,000 --> 00:00:02,000\nhello\n";

    fn write_zip(path: &Path, entries: &[(&str, &str)]) {
        use zip::write::SimpleFileOptions;
        let file = fs::File::create(path).unwrap();
        let mut zip = zip::ZipWriter::new(file);
        for (name, content) in entries {
            zip.start_file(*name, SimpleFileOptions::default()).unwrap();
            zip.write_all(content.as_bytes()).unwrap();
        }
        zip.finish().unwrap();
    }

    // ─── Scan ───────────────────────────────────────────────────────────────

    // @covers match-workflow/multi-source-selection-with-scan-preview-and-relocation-mode#mixed-sources-are-scanned
    #[test]
    fn scan_counts_a_folder_a_loose_file_and_an_archive() {
        let dir = TempDir::new().unwrap();
        let folder = dir.path().join("media");
        fs::create_dir(&folder).unwrap();
        fs::write(folder.join("movie.mkv"), b"video").unwrap();
        let loose = dir.path().join("loose.srt");
        fs::write(&loose, SRT).unwrap();
        let archive = dir.path().join("bundle.zip");
        write_zip(&archive, &[("archived.srt", SRT)]);

        let result = scan_sources(&[folder, loose, archive]).unwrap();

        assert_eq!(result.video_count, 1);
        // The loose subtitle plus the one extracted from the archive.
        assert_eq!(result.subtitle_count, 2);
    }

    // ─── Analysis ───────────────────────────────────────────────────────────

    #[tokio::test]
    async fn analysis_reports_each_stage_in_order() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("show.mkv"), b"v").unwrap();
        fs::write(dir.path().join("show.srt"), SRT).unwrap();
        let reporter = Arc::new(RecordingReporter::default());

        analyze_sources_impl(
            configured_service(),
            Arc::new(MatchState::default()),
            Arc::new(ScriptedAiFactory),
            reporter.clone(),
            vec![dir.path().to_path_buf()],
            RelocationModeDto::Rename,
        )
        .await
        .expect("analysis must succeed");

        assert_eq!(
            reporter.stages(),
            vec![
                MatchStage::Scanning,
                MatchStage::Analyzing,
                MatchStage::Finalizing
            ]
        );
    }

    // @covers match-workflow/review-of-the-match-plan-grouped-by-video#multi-language-matches-under-one-video
    #[tokio::test]
    async fn two_subtitles_group_under_one_video() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("show.mkv"), b"v").unwrap();
        fs::write(dir.path().join("show.en.srt"), SRT).unwrap();
        fs::write(dir.path().join("show.tc.srt"), SRT).unwrap();

        let plan = analyze_sources_impl(
            configured_service(),
            Arc::new(MatchState::default()),
            Arc::new(ScriptedAiFactory),
            Arc::new(RecordingReporter::default()),
            vec![dir.path().to_path_buf()],
            RelocationModeDto::Rename,
        )
        .await
        .expect("analysis must succeed");

        assert_eq!(plan.videos.len(), 1, "both matches under one video");
        assert_eq!(plan.videos[0].matches.len(), 2);
        assert!(plan.unmatched_videos.is_empty());
        assert!(plan.unmatched_subtitles.is_empty());
    }

    // @covers match-workflow/multi-source-selection-with-scan-preview-and-relocation-mode#relocation-mode-feeds-the-analysis
    #[tokio::test]
    async fn copy_mode_bakes_targets_into_the_video_directory() {
        let root = TempDir::new().unwrap();
        let video_dir = root.path().join("videos");
        let sub_dir = root.path().join("subs");
        fs::create_dir(&video_dir).unwrap();
        fs::create_dir(&sub_dir).unwrap();
        fs::write(video_dir.join("show.mkv"), b"v").unwrap();
        fs::write(sub_dir.join("show.srt"), SRT).unwrap();

        let plan = analyze_sources_impl(
            configured_service(),
            Arc::new(MatchState::default()),
            Arc::new(ScriptedAiFactory),
            Arc::new(RecordingReporter::default()),
            vec![video_dir.clone(), sub_dir],
            RelocationModeDto::Copy,
        )
        .await
        .expect("analysis must succeed");

        let target = &plan.videos[0].matches[0].target_path;
        assert!(
            target.starts_with(&video_dir.display().to_string()),
            "copy target must sit in the video's directory: {target}"
        );
    }

    // @covers match-workflow/cancellable-ai-analysis-with-staged-progress#ai-provider-not-configured
    #[tokio::test]
    async fn an_unconfigured_provider_points_at_settings() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("show.mkv"), b"v").unwrap();
        fs::write(dir.path().join("show.srt"), SRT).unwrap();

        let error = analyze_sources_impl(
            configured_service(),
            Arc::new(MatchState::default()),
            Arc::new(UnconfiguredAiFactory),
            Arc::new(RecordingReporter::default()),
            vec![dir.path().to_path_buf()],
            RelocationModeDto::Rename,
        )
        .await
        .expect_err("an unconfigured provider must fail the analysis");

        assert_eq!(error.code, "match.ai_not_configured");
        assert_eq!(
            error.hint_code.as_deref(),
            Some("match.ai_not_configured.hint")
        );
    }

    #[tokio::test]
    async fn analysis_rejects_sources_without_both_kinds() {
        let dir = TempDir::new().unwrap();
        // Subtitles only — no video.
        fs::write(dir.path().join("a.srt"), SRT).unwrap();
        fs::write(dir.path().join("b.srt"), SRT).unwrap();

        let error = analyze_sources_impl(
            configured_service(),
            Arc::new(MatchState::default()),
            Arc::new(ScriptedAiFactory),
            Arc::new(RecordingReporter::default()),
            vec![dir.path().to_path_buf()],
            RelocationModeDto::Rename,
        )
        .await
        .expect_err("insufficient sources must be rejected");

        assert_eq!(error.code, "match.sources_insufficient");
    }

    // @covers match-workflow/cancellable-ai-analysis-with-staged-progress#concurrent-analysis-is-rejected
    #[tokio::test]
    async fn a_second_analysis_is_rejected_while_one_runs() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("show.mkv"), b"v").unwrap();
        fs::write(dir.path().join("show.srt"), SRT).unwrap();
        let state = Arc::new(MatchState::default());

        // Occupy the single analysis slot with a task that never finishes.
        let blocker = tokio::spawn(std::future::pending::<()>());
        state.try_begin_analysis().await.expect("the slot starts free");
        state.set_running(blocker.abort_handle()).await;

        let error = analyze_sources_impl(
            configured_service(),
            state.clone(),
            Arc::new(ScriptedAiFactory),
            Arc::new(RecordingReporter::default()),
            vec![dir.path().to_path_buf()],
            RelocationModeDto::Rename,
        )
        .await
        .expect_err("a concurrent analysis must be rejected");

        assert_eq!(error.code, "match.analysis_in_progress");
        blocker.abort();
    }

    // @covers match-workflow/cancellable-ai-analysis-with-staged-progress#user-cancels-analysis
    #[tokio::test]
    async fn cancel_aborts_the_running_task_and_clears_the_plan() {
        let state = Arc::new(MatchState::default());
        let ran_to_completion = Arc::new(AtomicBool::new(false));
        let flag = ran_to_completion.clone();
        let task = tokio::spawn(async move {
            std::future::pending::<()>().await;
            flag.store(true, Ordering::SeqCst);
        });
        state.try_begin_analysis().await.expect("the slot starts free");
        state.set_running(task.abort_handle()).await;
        state
            .store_plan(ActivePlan::new(
                no_ai_engine(FileRelocationMode::None),
                Vec::new(),
                CollectedFiles::new(Vec::new()),
            ))
            .await;

        state.cancel().await;

        assert!(!state.is_running().await, "the slot must be freed");
        assert!(
            task.await.unwrap_err().is_cancelled(),
            "the analysis task must have been aborted"
        );
        assert!(!ran_to_completion.load(Ordering::SeqCst));
        assert!(
            state.take_plan_if("plan-1").await.is_none(),
            "the pending plan must be discarded"
        );
    }

    // ─── Execution ──────────────────────────────────────────────────────────

    async fn store_plan(state: &Arc<MatchState>, engine: MatchEngine, ops: Vec<MatchOperation>) -> String {
        let plan = ActivePlan::new(engine, ops, CollectedFiles::new(Vec::new()));
        let id = plan.id().to_string();
        state.store_plan(plan).await;
        id
    }

    // @covers match-workflow/checkbox-selection-of-operations#excluding-an-operation
    #[tokio::test]
    async fn only_the_selected_operations_are_executed() {
        let dir = TempDir::new().unwrap();
        let video = dir.path().join("v.mkv");
        fs::write(&video, b"v").unwrap();
        for name in ["a.srt", "b.srt", "c.srt"] {
            fs::write(dir.path().join(name), SRT).unwrap();
        }
        let ops = vec![
            rename_op(&video, &dir.path().join("a.srt"), "v.1.srt"),
            rename_op(&video, &dir.path().join("b.srt"), "v.2.srt"),
            rename_op(&video, &dir.path().join("c.srt"), "v.3.srt"),
        ];
        let state = Arc::new(MatchState::default());
        let id = store_plan(&state, no_ai_engine(FileRelocationMode::None), ops).await;

        let report = execute_selected_impl(state, &id, &[0, 2])
            .await
            .expect("execution must succeed");

        assert_eq!(report.success_count, 2);
        assert!(dir.path().join("v.1.srt").exists());
        assert!(dir.path().join("v.3.srt").exists());
        // The unselected operation left its subtitle untouched.
        assert!(dir.path().join("b.srt").exists());
        assert!(!dir.path().join("v.2.srt").exists());
    }

    // @covers match-workflow/execution-with-per-item-report#copy-mode-preserves-originals
    #[tokio::test]
    async fn copy_mode_leaves_the_original_in_place() {
        let root = TempDir::new().unwrap();
        let video_dir = root.path().join("vid");
        let sub_dir = root.path().join("subs");
        fs::create_dir(&video_dir).unwrap();
        fs::create_dir(&sub_dir).unwrap();
        let video = video_dir.join("v.mkv");
        let subtitle = sub_dir.join("s.srt");
        fs::write(&video, b"v").unwrap();
        fs::write(&subtitle, SRT).unwrap();

        let mut op = rename_op(&video, &subtitle, "v.srt");
        op.relocation_mode = FileRelocationMode::Copy;
        op.requires_relocation = true;
        op.relocation_target_path = Some(video_dir.join("v.srt"));

        let state = Arc::new(MatchState::default());
        let id = store_plan(&state, no_ai_engine(FileRelocationMode::Copy), vec![op]).await;
        let report = execute_selected_impl(state, &id, &[0])
            .await
            .expect("execution must succeed");

        assert_eq!(report.success_count, 1);
        assert!(video_dir.join("v.srt").exists(), "the copy must land by the video");
        assert!(subtitle.exists(), "copy mode must preserve the original");
    }

    // @covers match-workflow/execution-with-per-item-report#partial-failure-does-not-abort
    #[tokio::test]
    async fn a_failed_item_does_not_abort_the_others() {
        let dir = TempDir::new().unwrap();
        let video = dir.path().join("v.mkv");
        fs::write(&video, b"v").unwrap();
        fs::write(dir.path().join("a.srt"), SRT).unwrap();
        let missing = dir.path().join("gone.srt");
        fs::write(&missing, SRT).unwrap();
        let ops = vec![
            rename_op(&video, &dir.path().join("a.srt"), "v.1.srt"),
            rename_op(&video, &missing, "v.2.srt"),
        ];
        // Delete the second subtitle after the plan is built.
        fs::remove_file(&missing).unwrap();
        let state = Arc::new(MatchState::default());
        let id = store_plan(&state, no_ai_engine(FileRelocationMode::None), ops).await;

        let report = execute_selected_impl(state, &id, &[0, 1])
            .await
            .expect("execution must continue past a failure");

        assert_eq!(report.success_count, 1);
        assert_eq!(report.failure_count, 1);
        assert!(report.outcomes[1].error.is_some());
    }

    // @covers match-workflow/execution-with-per-item-report#archive-extracted-subtitle-lands-beside-the-video
    #[tokio::test]
    async fn an_archive_extracted_subtitle_lands_beside_the_video() {
        let video_dir = TempDir::new().unwrap();
        let video = video_dir.path().join("movie.mkv");
        fs::write(&video, b"v").unwrap();
        // A subtitle in a stand-in extraction directory whose `TempDir` is owned
        // by the `CollectedFiles` (as it is in production) — so this exercises
        // that execution keeps the temp dir alive rather than the test doing it.
        let extraction = TempDir::new().unwrap();
        let extraction_root = extraction.path().to_path_buf();
        let subtitle = extraction_root.join("movie.srt");
        fs::write(&subtitle, SRT).unwrap();

        let mut origins = HashMap::new();
        origins.insert(extraction_root, PathBuf::from("bundle.zip"));
        let collected = CollectedFiles::with_archives(
            vec![subtitle.clone(), video.clone()],
            vec![extraction],
            origins,
        );

        let mut ops = vec![rename_op(&video, &subtitle, "movie.srt")];
        rewrite_archive_origins(&mut ops, &collected);

        assert!(ops[0].requires_relocation);
        assert_eq!(ops[0].relocation_mode, FileRelocationMode::Copy);

        // Store the plan WITH the owning `collected`; execution must keep the
        // extraction temp dir alive across the copy.
        let plan = ActivePlan::new(no_ai_engine(FileRelocationMode::Copy), ops, collected);
        let state = Arc::new(MatchState::default());
        let id = plan.id().to_string();
        state.store_plan(plan).await;
        let report = execute_selected_impl(state, &id, &[0])
            .await
            .expect("execution must succeed");

        assert_eq!(report.success_count, 1);
        assert!(
            video_dir.path().join("movie.srt").exists(),
            "the extracted subtitle must end up next to the video"
        );
    }

    #[tokio::test]
    async fn an_empty_selection_executes_nothing() {
        let dir = TempDir::new().unwrap();
        let video = dir.path().join("v.mkv");
        fs::write(&video, b"v").unwrap();
        fs::write(dir.path().join("a.srt"), SRT).unwrap();
        let ops = vec![rename_op(&video, &dir.path().join("a.srt"), "v.1.srt")];
        let state = Arc::new(MatchState::default());
        let id = store_plan(&state, no_ai_engine(FileRelocationMode::None), ops).await;

        let report = execute_selected_impl(state, &id, &[])
            .await
            .expect("an empty selection is a no-op, not an error");

        assert_eq!(report.success_count, 0);
        assert!(report.outcomes.is_empty());
        // The unselected subtitle was left untouched.
        assert!(dir.path().join("a.srt").exists());
    }

    #[test]
    fn a_lock_failure_is_a_distinct_retryable_code() {
        let error = execution_locked();
        assert_eq!(error.code, "match.execution_locked");
        assert_eq!(error.hint_code.as_deref(), Some("match.execution_locked.hint"));
    }

    #[tokio::test]
    async fn execution_rejects_a_stale_plan() {
        let state = Arc::new(MatchState::default());
        let _id = store_plan(&state, no_ai_engine(FileRelocationMode::None), Vec::new()).await;

        let error = execute_selected_impl(state, "plan-does-not-exist", &[])
            .await
            .expect_err("an unknown plan id must be rejected");

        assert_eq!(error.code, "match.stale_plan");
        assert_eq!(error.hint_code.as_deref(), Some("match.stale_plan.hint"));
    }

    // ─── Unit-level helpers ─────────────────────────────────────────────────

    // @covers match-workflow/review-of-the-match-plan-grouped-by-video#unmatched-items-are-visible
    #[test]
    fn unmatched_sets_are_computed_against_the_whole_scan() {
        let dir = TempDir::new().unwrap();
        let video = dir.path().join("matched.mkv");
        let subtitle = dir.path().join("matched.srt");
        let op = rename_op(&video, &subtitle, "matched.srt");

        let scanned_videos = vec![
            (video.clone(), "matched.mkv".to_string()),
            (dir.path().join("lonely.mkv"), "lonely.mkv".to_string()),
        ];
        let scanned_subtitles = vec![
            (subtitle.clone(), "matched.srt".to_string()),
            (dir.path().join("orphan.srt"), "orphan.srt".to_string()),
        ];

        let plan = build_plan_dto(
            "plan-x",
            RelocationModeDto::Rename,
            std::slice::from_ref(&op),
            &scanned_videos,
            &scanned_subtitles,
        );

        assert_eq!(plan.unmatched_videos, vec!["lonely.mkv"]);
        assert_eq!(plan.unmatched_subtitles, vec!["orphan.srt"]);
        assert_eq!(plan.videos.len(), 1);
    }

    #[test]
    fn relocation_mode_maps_each_variant() {
        assert_eq!(
            to_relocation_mode(&RelocationModeDto::Rename),
            FileRelocationMode::None
        );
        assert_eq!(
            to_relocation_mode(&RelocationModeDto::Copy),
            FileRelocationMode::Copy
        );
        assert_eq!(
            to_relocation_mode(&RelocationModeDto::Move),
            FileRelocationMode::Move
        );
    }

    #[test]
    fn analysis_errors_split_transport_from_the_rest() {
        let retryable = map_analysis_error(SubXError::AiService("down".to_string()));
        assert_eq!(retryable.code, "match.ai_unavailable");
        assert_eq!(retryable.hint_code.as_deref(), Some("match.ai_unavailable.hint"));

        let other = map_analysis_error(SubXError::config("bad"));
        assert_eq!(other.code, "core.config");
    }

    #[test]
    fn a_per_item_failure_maps_to_a_core_code() {
        let op = rename_op(Path::new("v.mkv"), Path::new("s.srt"), "v.srt");
        let outcomes = vec![
            OperationOutcome {
                applied: true,
                error: None,
            },
            OperationOutcome {
                applied: false,
                error: Some(OperationError {
                    category: "file_operation_failed",
                    code: "E_FILE_OPERATION_FAILED",
                    message: "boom".to_string(),
                }),
            },
        ];
        let selected = vec![
            rename_op(Path::new("v.mkv"), Path::new("s.srt"), "v.srt"),
            op,
        ];

        let report = build_report(&selected, &outcomes);

        assert_eq!(report.success_count, 1);
        assert_eq!(report.failure_count, 1);
        assert_eq!(
            report.outcomes[1].error.as_ref().unwrap().code,
            "core.file_operation_failed"
        );
    }

    #[test]
    fn the_production_factory_builds_a_provider_from_configured_settings() {
        let service = TestConfigService::with_ai_settings_and_key(
            "openai",
            "gpt-4.1-mini",
            "sk-test-value-1234",
        );

        assert!(ProductionAiFactory.create_provider(&service).is_ok());
    }

    #[test]
    fn the_production_factory_reports_a_missing_key_as_unconfigured() {
        // A provider with no API key is exactly the "not configured yet" case.
        let service = TestConfigService::with_ai_settings("openai", "gpt-4.1-mini");

        // `Box<dyn AIProvider>` is not `Debug`, so match rather than `expect_err`.
        let error = match ProductionAiFactory.create_provider(&service) {
            Ok(_) => panic!("a keyless hosted provider must fail to build"),
            Err(error) => error,
        };

        assert_eq!(error.code, "match.ai_not_configured");
        assert_eq!(
            error.hint_code.as_deref(),
            Some("match.ai_not_configured.hint")
        );
    }

    #[test]
    fn the_channel_reporter_forwards_every_stage() {
        let count = Arc::new(AtomicUsize::new(0));
        let seen = count.clone();
        let channel: Channel<MatchProgress> = Channel::new(move |_body| {
            seen.fetch_add(1, Ordering::SeqCst);
            Ok(())
        });
        let reporter = ChannelReporter::new(channel);

        reporter.report(MatchStage::Scanning);
        reporter.report(MatchStage::Analyzing);
        reporter.report(MatchStage::Finalizing);

        assert_eq!(count.load(Ordering::SeqCst), 3);
    }
}
