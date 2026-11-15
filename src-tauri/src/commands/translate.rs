//! Translate wizard commands.
//!
//! The end-to-end GUI translation flow, wrapping the `subx-core` crate's
//! `TranslationEngine`: scan sources, resolve every output path and glossary
//! entry up front, hold the plan canonically in backend state, and translate a
//! reviewed subset with per-file progress, mid-file cancellation, and per-item
//! reporting. Like every command module this is a thin translation layer — the
//! translation itself all lives in the crate.
//!
//! `TranslationEngine::translate_subtitle` is pure in-memory (no filesystem
//! I/O) and takes a target language, glossary and context bundled into one
//! `TranslationRequest`. Its batch-level progress arrives through the
//! engine's `Reporter` seam as structured `ProgressEvent::Translation` events,
//! which [`ProgressTracker`] turns into full [`TranslateProgress`] snapshots. The CLI's output-resolution
//! and backup-naming logic (`resolve_output_path`, `backup_path` in
//! `translate_command.rs`) is private, so it is mirrored here: suffix naming
//! `{stem}.{lang}.{ext}` beside the input (beside the archive for
//! archive-extracted files), replace mode returning the input path and
//! refused for archive-extracted subtitles, and a `.backup` copy made before a
//! replace-mode write when `general.backup_enabled` is on.
//!
//! Two seams keep the flow testable: [`AiProviderFactory`] lets a test inject
//! a scripted `AIProvider` (mirroring `commands::r#match`'s seam, but handing
//! back the `Arc` `TranslationEngine::new` needs rather than a `Box`), and
//! [`TranslateReporter`] abstracts the progress sink so the batch logic runs
//! without a channel.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

use subx_core::core::input::{CollectedFiles, InputPathHandler};
use subx_core::config::ConfigService;
use subx_core::core::formats::manager::FormatManager;
use subx_core::core::matcher::{FileDiscovery, MediaFileType};
use subx_core::core::report::{ProgressEvent, Reporter, TranslationPass, TranslationProgress};
use subx_core::core::translation::{parse_glossary_text, TranslationEngine, TranslationRequest};
use subx_core::core::ComponentFactory;
use subx_core::error::SubXError;
use subx_core::services::ai::AIProvider;
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::watch;

use crate::dto::{
    TranslateItemDto, TranslateOptionsDto, TranslateOutputModeDto, TranslatePlanDto,
    TranslateProgress, TranslateScanItemDto, TranslateScanResult, TranslateStage,
    TranslationOutcomeDto, TranslationReportDto, TranslationStatusDto,
};
use crate::error::ErrorDto;
use crate::paths::{is_portal_document_entry, path_key, WriteGuard, CODE_PORTAL_DOCUMENT_TARGET};
use crate::state::{AppState, TranslateExecutionInputs, TranslatePlan, TranslatePlanItem, TranslateState};

// Stable error codes the frontend localizes (design D6). Kept as literals so
// `backendCodeParity.test.ts` can find them and demand `en`/`zh-TW` strings.
const CODE_NO_SUBTITLES: &str = "translate.no_subtitles";
const CODE_NO_TARGET_LANGUAGE: &str = "translate.no_target_language";
const CODE_STALE_PLAN: &str = "translate.stale_plan";
const CODE_TRANSLATION_IN_PROGRESS: &str = "translate.translation_in_progress";
const CODE_AI_NOT_CONFIGURED: &str = "translate.ai_not_configured";
const CODE_OUTPUT_EXISTS: &str = "translate.output_exists";
const CODE_OUTPUT_COLLISION: &str = "translate.output_collision";
const CODE_REPLACE_ARCHIVE_FORBIDDEN: &str = "translate.replace_archive_forbidden";
const CODE_UNPARSABLE: &str = "translate.unparsable";
const CODE_EMPTY_CUE_FALLBACK: &str = "translate.empty_cue_fallback";
const CODE_INVALID_TARGET_LANGUAGE: &str = "translate.invalid_target_language";

const HINT_NO_SUBTITLES: &str = "translate.no_subtitles.hint";
const HINT_NO_TARGET_LANGUAGE: &str = "translate.no_target_language.hint";
const HINT_STALE_PLAN: &str = "translate.stale_plan.hint";
const HINT_AI_NOT_CONFIGURED: &str = "translate.ai_not_configured.hint";
const HINT_INVALID_TARGET_LANGUAGE: &str = "translate.invalid_target_language.hint";

// ─── Command wrappers ───────────────────────────────────────────────────────
// Two lines each: translate DTOs, supply the production seams, delegate.

/// Scans the given sources for the Step 1 cue-count preview, and hands back
/// the configured default target language for Step 2 to prefill.
///
/// Takes no options on purpose — see [`TranslateScanResult`].
#[tauri::command]
#[specta::specta]
pub async fn list_translate_inputs(
    paths: Vec<String>,
    state: State<'_, AppState>,
) -> Result<TranslateScanResult, ErrorDto> {
    scan_translate_inputs(state.config_service(), &to_paths(&paths))
}

/// Resolves every output path and glossary entry for the chosen options and
/// stores the resulting plan, returning it for review in Step 2.
#[tauri::command]
#[specta::specta]
pub async fn preview_translation(
    paths: Vec<String>,
    options: TranslateOptionsDto,
    state: State<'_, AppState>,
) -> Result<TranslatePlanDto, ErrorDto> {
    preview_translation_impl(
        state.config_service(),
        state.translate_state(),
        to_paths(&paths),
        options,
        is_portal_document_entry,
    )
    .await
}

/// Translates exactly the selected items of a plan, reporting per-file
/// progress over `on_progress`, and returns each item's outcome.
#[tauri::command]
#[specta::specta]
pub async fn execute_translation(
    plan_id: String,
    item_ids: Vec<u32>,
    on_progress: Channel<TranslateProgress>,
    state: State<'_, AppState>,
) -> Result<TranslationReportDto, ErrorDto> {
    execute_translation_impl(
        state.config_service_arc(),
        state.translate_state(),
        Arc::new(ProductionAiFactory),
        Arc::new(ChannelReporter::new(on_progress)),
        &plan_id,
        &item_ids,
    )
    .await
}

/// Signals a running batch to stop after its in-flight file and discards the
/// pending plan (design D3).
#[tauri::command]
#[specta::specta]
pub async fn cancel_translation(state: State<'_, AppState>) -> Result<(), ErrorDto> {
    state.translate_state().cancel().await;
    Ok(())
}

// ─── Seams ──────────────────────────────────────────────────────────────────

/// Builds the AI provider for a batch. Injected so tests can script one.
///
/// Hands back an `Arc`, not a `Box`: `TranslationEngine::new` takes
/// `Arc<dyn AIProvider>` (the crate shares it internally rather than owning it
/// outright, unlike `MatchEngine`), so the seam matches the constructor it
/// feeds rather than mirroring `commands::r#match`'s `Box` verbatim.
pub trait AiProviderFactory: Send + Sync {
    fn create_provider(&self, service: &dyn ConfigService) -> Result<Arc<dyn AIProvider>, ErrorDto>;
}

/// The production factory: builds the provider from the shared config.
struct ProductionAiFactory;

impl AiProviderFactory for ProductionAiFactory {
    fn create_provider(&self, service: &dyn ConfigService) -> Result<Arc<dyn AIProvider>, ErrorDto> {
        // Reload first: the user may have just configured the provider on the
        // Settings screen, and `ProductionConfigService` caches the file.
        service.reload().map_err(ErrorDto::from)?;
        let factory = ComponentFactory::new(service).map_err(map_provider_error)?;
        let provider = factory.create_ai_provider().map_err(map_provider_error)?;
        Ok(Arc::from(provider))
    }
}

/// Reports batch progress. Injected so the logic runs without an `AppHandle`.
pub trait TranslateReporter: Send + Sync {
    fn report(&self, progress: TranslateProgress);
}

/// The production reporter: pushes progress over the invocation's `Channel`.
struct ChannelReporter {
    channel: Channel<TranslateProgress>,
}

impl ChannelReporter {
    fn new(channel: Channel<TranslateProgress>) -> Self {
        Self { channel }
    }
}

impl TranslateReporter for ChannelReporter {
    fn report(&self, progress: TranslateProgress) {
        // Progress is best-effort: a failed send must not fail the batch.
        let _ = self.channel.send(progress);
    }
}

// ─── Implementations ────────────────────────────────────────────────────────

/// Scans the sources for Step 1: which subtitles are there, how many cues
/// each holds, and what target language the configuration defaults to.
///
/// Nothing here depends on the wizard's options, which is the whole point:
/// Step 1 must be reachable and informative before the user has chosen a
/// target language, since the field that supplies one lives on Step 2.
///
/// Not `async`: `FormatManager` holds boxed format handlers that are not
/// `Send`, and a synchronous function can hold one without infecting a
/// command future (the hazard `preview_translation_impl` scopes around).
fn scan_translate_inputs(
    service: &dyn ConfigService,
    paths: &[PathBuf],
) -> Result<TranslateScanResult, ErrorDto> {
    // Reload first: the configured default may have just changed on the
    // Settings screen, and `ProductionConfigService` caches the file.
    service.reload().map_err(ErrorDto::from)?;
    let config = service.get_config().map_err(ErrorDto::from)?;
    let default_target_language = config
        .translation
        .default_target_language
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);

    let collected = collect_input_files(paths)?;
    let inputs = subtitle_files(&collected)?;
    if inputs.is_empty() {
        return Err(no_subtitles());
    }

    let sources = SourceKeys::new(paths);
    let format_manager = FormatManager::new();
    let files = inputs
        .iter()
        .map(|input| {
            // The same parse the plan performs later, for the same reason: a
            // file that cannot be parsed can never be translated, and saying
            // so now costs one read and no AI request.
            let cue_count = format_manager
                .load_subtitle(input)
                .ok()
                .map(|subtitle| subtitle.entries.len() as u32);
            TranslateScanItemDto {
                name: display_name(input),
                source: attribute_source(input, &sources, &collected),
                cue_count: cue_count.unwrap_or(0),
                unparsable: cue_count.is_none(),
            }
        })
        .collect();

    Ok(TranslateScanResult {
        files,
        default_target_language,
    })
}

/// Builds and stores the translation plan for one set of options.
///
/// Everything the user is about to authorize is decided here: which files
/// run, where each one lands, and which of them conflict. Execution then
/// performs exactly this plan and decides nothing further (design D1).
async fn preview_translation_impl(
    service: &dyn ConfigService,
    translate_state: Arc<TranslateState>,
    paths: Vec<PathBuf>,
    options: TranslateOptionsDto,
    is_blocked: WriteGuard,
) -> Result<TranslatePlanDto, ErrorDto> {
    // Pin the epoch before doing any work: a cancel while the sources are
    // being collected must discard this plan rather than install it behind
    // the user.
    let epoch = translate_state.current_epoch().await;

    // Reload first: the configured default target language may have just
    // changed on the Settings screen.
    service.reload().map_err(ErrorDto::from)?;
    let config = service.get_config().map_err(ErrorDto::from)?;
    let target_language = resolve_target_language(
        options.target_language.as_deref(),
        config.translation.default_target_language.as_deref(),
    )?;
    reject_path_like_language(&target_language)?;

    let collected = collect_input_files(&paths)?;
    let inputs = subtitle_files(&collected)?;
    if inputs.is_empty() {
        return Err(no_subtitles());
    }

    let replace_mode = matches!(options.output_mode, TranslateOutputModeDto::Replace);

    // Output paths already claimed by an earlier item. Two archive entries
    // sharing a basename resolve beside the archive to the same suffix output
    // (design D4), and translating both would silently last-write-win while
    // reporting two successes.
    let mut claimed: HashSet<String> = HashSet::new();
    let mut items = Vec::with_capacity(inputs.len());
    {
        // Scoped tightly around the loop: `FormatManager` holds boxed format
        // handlers that are not `Send`, so it must be dropped before the
        // `commit_plan` await below or the whole future stops being `Send`
        // (the same hazard `commands::convert` hit with its converter).
        let format_manager = FormatManager::new();
        for input in inputs {
            let is_archived = collected.archive_origin(&input).is_some();

            // Parsing doubles as early validation (design D1): a file that
            // cannot be parsed can never be translated, whatever its output
            // would have been, and this happens before any AI request.
            let cue_count = format_manager
                .load_subtitle(&input)
                .ok()
                .map(|subtitle| subtitle.entries.len() as u32);

            let mut skip_reason = if cue_count.is_none() {
                Some(CODE_UNPARSABLE.to_string())
            } else if replace_mode && is_archived {
                Some(CODE_REPLACE_ARCHIVE_FORBIDDEN.to_string())
            } else {
                None
            };

            let output = resolve_output_path(&input, &collected, replace_mode, &target_language);

            // A document-portal entry cannot hold a new file under its own
            // name. Decided before the collision claim so a refused item does
            // not take the slot a runnable one needs, and never lifted by
            // `overwrite`: the existing-output branch below only runs for an
            // item that still has no skip reason.
            if skip_reason.is_none() && is_blocked(&output) {
                skip_reason = Some(CODE_PORTAL_DOCUMENT_TARGET.to_string());
            }

            // Only a runnable item claims its output path: an item already
            // excluded for another reason must not consume the collision slot
            // a parsable, runnable item might otherwise need.
            if skip_reason.is_none() && !claimed.insert(path_key(&output)) {
                skip_reason = Some(CODE_OUTPUT_COLLISION.to_string());
            }

            // `output_exists` only carries meaning in suffix mode: replace
            // mode's output is the input itself, which trivially "exists" and
            // is governed by the backup/archive rules instead (design D4).
            let output_exists = !replace_mode && skip_reason.is_none() && output.exists();
            if output_exists && !options.overwrite {
                skip_reason = Some(CODE_OUTPUT_EXISTS.to_string());
            }

            items.push(TranslatePlanItem {
                id: items.len() as u32,
                input,
                output,
                cue_count: cue_count.unwrap_or(0),
                output_exists,
                skip_reason,
            });
        }
    }

    let plan = TranslatePlan::new(
        target_language,
        options.source_language,
        options.context,
        options.glossary_text,
        replace_mode,
        items,
        collected,
    );
    let dto = build_plan_dto(&plan, options.output_mode);

    if translate_state.commit_plan(epoch, plan).await {
        Ok(dto)
    } else {
        // A cancel landed while we were resolving; the user is back on Step 1.
        Err(stale_plan())
    }
}

/// Runs one batch, guarding the single execution slot around it.
///
/// The slot is reserved before anything is translated, so a second caller
/// translates nothing at all rather than racing this one over the same
/// outputs.
async fn execute_translation_impl(
    service: Arc<dyn ConfigService>,
    translate_state: Arc<TranslateState>,
    factory: Arc<dyn AiProviderFactory>,
    reporter: Arc<dyn TranslateReporter>,
    plan_id: &str,
    item_ids: &[u32],
) -> Result<TranslationReportDto, ErrorDto> {
    let cancel_rx = translate_state
        .try_begin_execution()
        .await
        .map_err(|()| translation_in_progress())?;

    // Not `?`: the slot must be released on every path out of the batch,
    // including the stale-plan rejection below.
    let report = run_batch(
        service,
        Arc::clone(&translate_state),
        factory,
        reporter,
        plan_id,
        item_ids,
        cancel_rx,
    )
    .await;
    translate_state.finish_execution().await;
    report
}

/// The batch body: consume the plan, build the engine once, translate each
/// selected item, report.
async fn run_batch(
    service: Arc<dyn ConfigService>,
    translate_state: Arc<TranslateState>,
    factory: Arc<dyn AiProviderFactory>,
    reporter: Arc<dyn TranslateReporter>,
    plan_id: &str,
    item_ids: &[u32],
    cancel_rx: watch::Receiver<bool>,
) -> Result<TranslationReportDto, ErrorDto> {
    // A plan is translated once; consuming it here drops its `CollectedFiles`
    // when we return, which is what deletes the archive-extraction temp dirs.
    let plan = translate_state.take_plan_if(plan_id).await.ok_or_else(stale_plan)?;
    let TranslateExecutionInputs {
        target_language,
        source_language,
        context,
        glossary_text,
        replace_mode,
        items,
        // `_collected` owns the archive-extraction temp dirs; it MUST stay in
        // scope across every translation `.await`, or an archive-sourced
        // item's source path is deleted before it is read.
        collected: _collected,
    } = plan.into_execution();

    // The provider is built before the first file so a configuration problem
    // fails the run in one step, not once per file (design D5). Config is
    // read only after this, so it reflects the factory's own reload.
    let provider = factory.create_provider(service.as_ref())?;
    let config = service.get_config().map_err(ErrorDto::from)?;

    let glossary_entries = parse_glossary_text(glossary_text.as_deref().unwrap_or(""));
    let request = TranslationRequest {
        target_language,
        source_language,
        glossary_text,
        context,
        glossary_entries,
    };

    // The item travels whole, ID included: progress names files by plan ID,
    // which a queue position would renumber once an earlier item is
    // deselected (design D5).
    let selected: HashSet<u32> = item_ids.iter().copied().collect();
    let queue: Vec<TranslatePlanItem> = items
        .into_iter()
        .filter(|item| selected.contains(&item.id))
        .collect();

    let BatchResult { outcomes, cancelled } = translate_batch_off_thread(
        provider,
        config.translation.batch_size,
        config.general.backup_enabled,
        request,
        replace_mode,
        queue,
        reporter,
        cancel_rx,
    )
    .await?;

    Ok(build_report(outcomes, cancelled))
}

/// What one off-thread batch run produced.
struct BatchResult {
    outcomes: Vec<TranslationOutcomeDto>,
    cancelled: bool,
}

/// Builds the engine and runs the whole per-item loop on a blocking worker
/// that owns it outright.
///
/// `TranslationEngine` holds a `FormatManager`, which — like
/// `commands::convert`'s `FormatConverter` — holds boxed format handlers that
/// are neither `Send` nor `Sync`. Holding one across an `.await` would make
/// this command's future non-`Send`, which Tauri's async-command bound
/// rejects. Building the engine *inside* the worker keeps it off the
/// command's future entirely; the worker gets its own current-thread runtime
/// so it can still `.await` each file's AI round-trips and race them against
/// `cancel_rx` (`watch::Receiver` is `Send`, so it crosses into the worker
/// cleanly).
#[allow(clippy::too_many_arguments)]
async fn translate_batch_off_thread(
    provider: Arc<dyn AIProvider>,
    batch_size: usize,
    backup_enabled: bool,
    request: TranslationRequest,
    replace_mode: bool,
    queue: Vec<TranslatePlanItem>,
    reporter: Arc<dyn TranslateReporter>,
    mut cancel_rx: watch::Receiver<bool>,
) -> Result<BatchResult, ErrorDto> {
    tokio::task::spawn_blocking(move || -> Result<BatchResult, ErrorDto> {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|err| ErrorDto::new("core.other", format!("the translation worker failed: {err}")))?;
        runtime.block_on(async move {
            let tracker = Arc::new(ProgressTracker::new(reporter, cancel_rx.clone()));
            let engine = TranslationEngine::new(provider, batch_size)
                .map_err(ErrorDto::from)?
                .with_reporter(Arc::new(EngineProgressReporter(Arc::clone(&tracker))));
            let total = queue.len() as u32;
            let batch_size = u32::try_from(batch_size).unwrap_or(u32::MAX);
            let mut outcomes = Vec::with_capacity(queue.len());
            let mut cancelled = false;

            for (position, item) in queue.iter().enumerate() {
                let name = display_name(&item.input);
                let base = FileStart {
                    index: position as u32 + 1,
                    total,
                    name: name.clone(),
                    item,
                    batch_size,
                };

                // Checked before each item, and again below mid-item: unlike
                // convert's between-files-only cancel, translation is
                // interrupted while a file is in flight too (design D3).
                if cancelled || *cancel_rx.borrow() {
                    cancelled = true;
                    outcomes.push(cancelled_outcome(item, &name));
                    tracker.never_started(&base, TranslationStatusDto::Cancelled);
                    continue;
                }

                // The UI cannot select an excluded item; refusing it here
                // means a hand-built `item_ids` cannot translate one either.
                if let Some(reason) = &item.skip_reason {
                    let mut skipped = blank_outcome(item, &name, TranslationStatusDto::Skipped);
                    skipped.error =
                        Some(ErrorDto::new(reason.clone(), "the item is excluded from the plan"));
                    outcomes.push(skipped);
                    tracker.never_started(&base, TranslationStatusDto::Skipped);
                    continue;
                }

                tracker.start_file(&base);
                let before_write = || tracker.writing();

                // Races the whole per-file translation (load, AI round-trips,
                // write) against the cancel signal. Dropping the losing
                // `translate_one` branch cancels its pending HTTP request;
                // because a write only happens after full success, the
                // abandoned file simply has no output (design D2, D3).
                let raced = tokio::select! {
                    biased;
                    _ = cancel_rx.changed() => None,
                    outcome = translate_one(&engine, &request, item, replace_mode, backup_enabled, &before_write) => Some(outcome),
                };

                match raced {
                    None => {
                        cancelled = true;
                        outcomes.push(cancelled_outcome(item, &name));
                        tracker.finish_file(TranslationStatusDto::Cancelled);
                    }
                    Some(outcome) => {
                        tracker.finish_file(outcome.status.clone());
                        outcomes.push(outcome);
                    }
                }
            }

            tracker.finished(total);

            Ok(BatchResult { outcomes, cancelled })
        })
    })
    .await
    .map_err(|err| ErrorDto::new("core.other", format!("the translation worker failed: {err}")))?
}

/// Translates one file and writes it: load, translate in memory, back up (if
/// replacing with backups on), then save.
///
/// Save happens only after the translation fully succeeded, so a failure —
/// whatever caused it — never leaves a half-translated subtitle on disk
/// (design D2).
async fn translate_one(
    engine: &TranslationEngine,
    request: &TranslationRequest,
    item: &TranslatePlanItem,
    replace_mode: bool,
    backup_enabled: bool,
    before_write: &dyn Fn(),
) -> TranslationOutcomeDto {
    let name = display_name(&item.input);
    let mut record = blank_outcome(item, &name, TranslationStatusDto::Translated);

    let subtitle = match engine.format_manager().load_subtitle(&item.input) {
        Ok(subtitle) => subtitle,
        Err(err) => {
            record.status = TranslationStatusDto::Failed;
            record.error = Some(ErrorDto::from(err));
            return record;
        }
    };
    // Recorded before the subtitle is moved into `translate_subtitle`, so the
    // empty-cue-fallback check below can tell "the engine gave up on this
    // cue" apart from "the original cue was already empty" (design D6). The
    // engine does not expose which cues it gave up on, so this is inferred
    // rather than exact: a cue the AI legitimately translated to an empty
    // string (e.g. a filler line) is observably identical to a retry-exhausted
    // fallback, and would also be flagged. Rare and non-fatal — a warning, not
    // a failure — so the false positive is an acceptable approximation.
    let had_text: Vec<bool> = subtitle
        .entries
        .iter()
        .map(|entry| !entry.text.trim().is_empty())
        .collect();

    let result = match engine.translate_subtitle(subtitle, request).await {
        Ok(result) => result,
        Err(err) => {
            record.status = TranslationStatusDto::Failed;
            record.error = Some(ErrorDto::from(err));
            return record;
        }
    };

    // Everything from here on is synchronous, so the cancel race cannot
    // interrupt a write half-way: once `writing` is reported the file lands.
    before_write();

    if replace_mode && backup_enabled {
        let backup = backup_path(&item.input);
        if let Err(err) = std::fs::copy(&item.input, &backup) {
            record.status = TranslationStatusDto::Failed;
            record.error = Some(ErrorDto::from(SubXError::FileOperationFailed(format!(
                "Failed to create backup {}: {err}",
                backup.display()
            ))));
            return record;
        }
        record.backup_path = Some(backup.display().to_string());
    }

    if let Err(err) = engine.format_manager().save_subtitle(&result.subtitle, &item.output) {
        record.status = TranslationStatusDto::Failed;
        record.error = Some(ErrorDto::from(err));
        return record;
    }

    let empty_fallback_count = result
        .subtitle
        .entries
        .iter()
        .zip(had_text.iter())
        .filter(|(entry, had_text)| **had_text && entry.text.trim().is_empty())
        .count();
    if empty_fallback_count > 0 {
        record.warning = Some(ErrorDto::new(
            CODE_EMPTY_CUE_FALLBACK,
            format!("{empty_fallback_count} cue(s) were left empty in the translated output"),
        ));
    }

    record
}

// ─── Progress ───────────────────────────────────────────────────────────────

/// What the batch loop knows about a file when it picks it.
struct FileStart<'a> {
    index: u32,
    total: u32,
    name: String,
    item: &'a TranslatePlanItem,
    batch_size: u32,
}

impl FileStart<'_> {
    /// The snapshot a file starts from: counters zero, and the bar's batch
    /// count derived from the plan's cue count so it can be drawn during the
    /// terminology phase (design D6).
    fn snapshot(&self, stage: TranslateStage) -> TranslateProgress {
        let batch_total = if self.batch_size == 0 {
            0
        } else {
            self.item.cue_count.div_ceil(self.batch_size)
        };
        TranslateProgress {
            stage,
            index: self.index,
            total: self.total,
            file_name: self.name.clone(),
            item_id: self.item.id,
            processed_cues: 0,
            total_cues: self.item.cue_count,
            batch_size: self.batch_size,
            batch_total,
            batches_done: 0,
            batch_in_flight: 0,
            resend: false,
            outcome: None,
        }
    }
}

/// Narrows an engine count for the IPC boundary, which carries no `u64`.
fn narrow(value: u64) -> u32 {
    u32::try_from(value).unwrap_or(u32::MAX)
}

/// The per-file progress state the engine reporter and the batch loop share.
///
/// One engine serves the whole run, so the loop resets the state before each
/// file (design D5). Every update forwards a full snapshot to the
/// [`TranslateReporter`]. The mutex is uncontended — the engine and the loop
/// run on the same single-threaded runtime — and is released before the sink
/// is called.
struct ProgressTracker {
    /// The file in flight, `None` between files.
    current: Mutex<Option<TranslateProgress>>,
    sink: Arc<dyn TranslateReporter>,
    cancel: watch::Receiver<bool>,
}

impl ProgressTracker {
    fn new(sink: Arc<dyn TranslateReporter>, cancel: watch::Receiver<bool>) -> Self {
        Self {
            current: Mutex::new(None),
            sink,
            cancel,
        }
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, Option<TranslateProgress>> {
        self.current.lock().unwrap_or_else(PoisonError::into_inner)
    }

    /// Updates the file in flight and forwards it, unless the run was
    /// cancelled or no file is in flight: after a cancel only the cancelled
    /// completions and the final `Finished` may follow (design D6).
    fn update(&self, change: impl FnOnce(&mut TranslateProgress)) {
        if *self.cancel.borrow() {
            return;
        }
        let snapshot = {
            let mut current = self.lock();
            let Some(progress) = current.as_mut() else {
                return;
            };
            change(progress);
            progress.clone()
        };
        self.sink.report(snapshot);
    }

    fn start_file(&self, start: &FileStart<'_>) {
        let snapshot = start.snapshot(TranslateStage::Terminology);
        *self.lock() = Some(snapshot.clone());
        self.sink.report(snapshot);
    }

    fn writing(&self) {
        self.update(|progress| {
            progress.stage = TranslateStage::Writing;
            progress.batch_in_flight = 0;
            progress.resend = false;
        });
    }

    /// Ends the file in flight with its outcome. Not gated on the cancel
    /// signal: the abandoned file's cancelled completion must still be sent.
    fn finish_file(&self, outcome: TranslationStatusDto) {
        let Some(mut snapshot) = self.lock().take() else {
            return;
        };
        snapshot.stage = TranslateStage::FileDone;
        snapshot.batch_in_flight = 0;
        snapshot.resend = false;
        snapshot.outcome = Some(outcome);
        self.sink.report(snapshot);
    }

    /// Completion of a file the loop never handed to the engine: a skipped
    /// item, or one left unstarted by a cancel. No terminology precedes it.
    fn never_started(&self, start: &FileStart<'_>, outcome: TranslationStatusDto) {
        let mut snapshot = start.snapshot(TranslateStage::FileDone);
        snapshot.outcome = Some(outcome);
        self.sink.report(snapshot);
    }

    fn finished(&self, total: u32) {
        self.sink.report(TranslateProgress {
            stage: TranslateStage::Finished,
            index: total,
            total,
            file_name: String::new(),
            item_id: 0,
            processed_cues: 0,
            total_cues: 0,
            batch_size: 0,
            batch_total: 0,
            batches_done: 0,
            batch_in_flight: 0,
            resend: false,
            outcome: None,
        });
    }

    /// Maps one engine event onto the file in flight (design D6's table).
    fn on_engine_event(&self, event: &TranslationProgress) {
        match *event {
            TranslationProgress::BatchStarted {
                pass,
                batch,
                batches,
                attempt,
                ..
            } => match pass {
                TranslationPass::Initial => self.update(|progress| {
                    progress.stage = TranslateStage::Translating;
                    progress.batch_total = narrow(batches);
                    progress.batches_done = progress.batches_done.min(progress.batch_total);
                    progress.batch_in_flight = narrow(batch);
                    progress.resend = attempt > 1;
                }),
                TranslationPass::FillIn => self.update(|progress| {
                    progress.stage = TranslateStage::FillIn;
                    progress.batch_in_flight = 0;
                    progress.resend = false;
                }),
                _ => {}
            },
            TranslationProgress::BatchFinished {
                pass,
                batch,
                batches,
                processed_cues,
                total_cues,
            } => match pass {
                TranslationPass::Initial => self.update(|progress| {
                    progress.stage = TranslateStage::Translating;
                    progress.batch_total = narrow(batches);
                    progress.batches_done = narrow(batch).min(progress.batch_total);
                    progress.batch_in_flight = 0;
                    progress.resend = false;
                    progress.processed_cues = narrow(processed_cues);
                    progress.total_cues = narrow(total_cues);
                }),
                TranslationPass::FillIn => self.update(|progress| {
                    progress.stage = TranslateStage::FillIn;
                    progress.processed_cues = narrow(processed_cues);
                    progress.total_cues = narrow(total_cues);
                }),
                _ => {}
            },
            // The terminology phase is already shown from the moment the file
            // starts, so its bracket changes nothing visible; later variants
            // are uninteresting until the GUI learns to show them.
            _ => {}
        }
    }
}

/// The engine-side `Reporter`: forwards only the structured translation
/// events, so the engine's human-oriented text lines never reach the GUI.
struct EngineProgressReporter(Arc<ProgressTracker>);

impl Reporter for EngineProgressReporter {
    fn progress(&self, event: &ProgressEvent<'_>) {
        if let ProgressEvent::Translation(progress) = event {
            self.0.on_engine_event(progress);
        }
    }
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

fn to_paths(paths: &[String]) -> Vec<PathBuf> {
    paths.iter().map(PathBuf::from).collect()
}

/// Expands folders, files and archives via the crate's input handler.
///
/// Uses `InputPathHandler`, not bare `FileDiscovery`, because only the former
/// extracts archives and records each extracted file's origin.
fn collect_input_files(paths: &[PathBuf]) -> Result<CollectedFiles, ErrorDto> {
    let handler = InputPathHandler::from_args(paths, true).map_err(ErrorDto::from)?;
    handler.collect_files().map_err(ErrorDto::from)
}

/// The subtitle files among the collected inputs, in scan order, each once.
///
/// A file reachable through several sources — added directly and through its
/// folder, or under nested folder sources — is kept at its first occurrence
/// in source order (design D3). Both the scan and the plan read this, so the
/// plan never offers a duplicate that would only collide with itself.
fn subtitle_files(collected: &CollectedFiles) -> Result<Vec<PathBuf>, ErrorDto> {
    let file_paths: &[PathBuf] = collected;
    let media = FileDiscovery::new()
        .scan_file_list(file_paths)
        .map_err(ErrorDto::from)?;

    let mut seen = HashSet::new();
    Ok(media
        .into_iter()
        .filter(|file| matches!(file.file_type, MediaFileType::Subtitle))
        .map(|file| file.path)
        .filter(|path| seen.insert(resolved_key(path)))
        .collect())
}

/// A comparison key for "the same file": canonical where it resolves, the
/// raw path otherwise.
fn resolved_key(path: &Path) -> PathBuf {
    std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf())
}

/// The user's sources in the order given, each with its resolved form,
/// computed once per scan.
struct SourceKeys {
    sources: Vec<(PathBuf, PathBuf)>,
}

impl SourceKeys {
    fn new(paths: &[PathBuf]) -> Self {
        Self {
            sources: paths
                .iter()
                .map(|path| (path.clone(), resolved_key(path)))
                .collect(),
        }
    }
}

/// The source the user added that produced `path` (design D3).
///
/// An archive entry belongs to its archive. Otherwise the first source in the
/// order given that produced the file wins: the file itself, or a folder it
/// sits under. A file that matches no source (reached through a symlink, say)
/// falls back to its parent folder so it still lands in a folder group.
fn attribute_source(path: &Path, sources: &SourceKeys, collected: &CollectedFiles) -> String {
    if let Some(archive) = collected.archive_origin(path) {
        return archive.to_string_lossy().to_string();
    }
    let resolved = resolved_key(path);
    sources
        .sources
        .iter()
        .find(|(raw, key)| resolved.starts_with(key) || path.starts_with(raw))
        .map(|(raw, _)| raw.to_string_lossy().to_string())
        .unwrap_or_else(|| {
            path.parent()
                .unwrap_or(path)
                .to_string_lossy()
                .to_string()
        })
}

/// The effective target language using CLI > config precedence (design D5),
/// mirroring `translate_command.rs`'s private `resolve_target_language`.
fn resolve_target_language(per_run: Option<&str>, default: Option<&str>) -> Result<String, ErrorDto> {
    if let Some(value) = per_run {
        let trimmed = value.trim();
        if !trimmed.is_empty() {
            return Ok(trimmed.to_string());
        }
    }
    match default {
        Some(value) if !value.trim().is_empty() => Ok(value.trim().to_string()),
        _ => Err(no_target_language()),
    }
}

/// Rejects a target language that could redirect the output outside the
/// plan's intended directory.
///
/// The language becomes part of one generated file name
/// (`{stem}.{target_language}.{ext}`, see [`translated_file_name`]); a value
/// containing a path separator would make `PathBuf::join` treat it as
/// multiple components instead of one file name, e.g. `../../elsewhere`. The
/// crate's own CLI never validates this (`--target-language` is a shell
/// argument the user already controls directly), but the GUI exposes the
/// field as a free-text box fed from a resolvable configuration default too —
/// a lower trust bar, worth the cheap check.
fn reject_path_like_language(language: &str) -> Result<(), ErrorDto> {
    if language.contains(['/', '\\']) {
        return Err(invalid_target_language());
    }
    Ok(())
}

/// `{stem}.{target-language}.{ext}`, mirroring `translate_command.rs`'s
/// private `translated_file_name`.
fn translated_file_name(input: &Path, target_language: &str) -> String {
    let stem = input.file_stem().and_then(|s| s.to_str()).unwrap_or("subtitle");
    let ext = input.extension().and_then(|s| s.to_str()).unwrap_or("srt");
    format!("{stem}.{target_language}.{ext}")
}

/// Where one input's translation will be written.
///
/// Mirrors `translate_command.rs`'s private `resolve_output_path`: replace
/// mode returns the input path itself; suffix mode lands beside the input,
/// except for archive-extracted files, which land beside the archive rather
/// than inside the extraction directory the user never chose (design Context).
fn resolve_output_path(
    input: &Path,
    collected: &CollectedFiles,
    replace_mode: bool,
    target_language: &str,
) -> PathBuf {
    if replace_mode {
        return input.to_path_buf();
    }
    let base_dir = collected
        .archive_origin(input)
        .and_then(Path::parent)
        .or_else(|| input.parent())
        .unwrap_or_else(|| Path::new("."));
    base_dir.join(translated_file_name(input, target_language))
}

/// The backup path a replace-mode write copies the original to, mirroring
/// `translate_command.rs`'s private `backup_path`.
fn backup_path(input: &Path) -> PathBuf {
    let ext = input.extension().and_then(|s| s.to_str()).unwrap_or("");
    if ext.is_empty() {
        input.with_extension("backup")
    } else {
        input.with_extension(format!("{ext}.backup"))
    }
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string())
}

/// A blank outcome for one item, filled in by the caller.
fn blank_outcome(item: &TranslatePlanItem, name: &str, status: TranslationStatusDto) -> TranslationOutcomeDto {
    TranslationOutcomeDto {
        input_name: name.to_string(),
        output_path: item.output.display().to_string(),
        status,
        backup_path: None,
        error: None,
        warning: None,
    }
}

fn cancelled_outcome(item: &TranslatePlanItem, name: &str) -> TranslationOutcomeDto {
    blank_outcome(item, name, TranslationStatusDto::Cancelled)
}

fn build_plan_dto(plan: &TranslatePlan, output_mode: TranslateOutputModeDto) -> TranslatePlanDto {
    TranslatePlanDto {
        plan_id: plan.id().to_string(),
        target_language: plan.target_language().to_string(),
        output_mode,
        items: plan
            .items()
            .iter()
            .map(|item| TranslateItemDto {
                id: item.id,
                input_name: display_name(&item.input),
                input_path: item.input.display().to_string(),
                output_path: item.output.display().to_string(),
                cue_count: item.cue_count,
                output_exists: item.output_exists,
                skip_reason: item.skip_reason.clone(),
            })
            .collect(),
    }
}

fn build_report(outcomes: Vec<TranslationOutcomeDto>, cancelled: bool) -> TranslationReportDto {
    let success_count = outcomes
        .iter()
        .filter(|outcome| outcome.status == TranslationStatusDto::Translated)
        .count() as u32;
    let failure_count = outcomes
        .iter()
        .filter(|outcome| outcome.status == TranslationStatusDto::Failed)
        .count() as u32;

    TranslationReportDto {
        outcomes,
        success_count,
        failure_count,
        cancelled,
    }
}

// ─── Error mapping ──────────────────────────────────────────────────────────

/// Provider construction only fails on configuration problems (unsupported
/// provider, missing key or model), all pointing the user at Settings.
fn map_provider_error(err: SubXError) -> ErrorDto {
    ErrorDto::new(CODE_AI_NOT_CONFIGURED, err.to_string()).with_hint(HINT_AI_NOT_CONFIGURED)
}

fn no_subtitles() -> ErrorDto {
    ErrorDto::new(CODE_NO_SUBTITLES, "the sources hold no translatable subtitles")
        .with_hint(HINT_NO_SUBTITLES)
}

fn no_target_language() -> ErrorDto {
    ErrorDto::new(
        CODE_NO_TARGET_LANGUAGE,
        "no target language was provided and none is configured",
    )
    .with_hint(HINT_NO_TARGET_LANGUAGE)
}

fn invalid_target_language() -> ErrorDto {
    ErrorDto::new(
        CODE_INVALID_TARGET_LANGUAGE,
        "the target language must not contain a path separator",
    )
    .with_hint(HINT_INVALID_TARGET_LANGUAGE)
}

fn stale_plan() -> ErrorDto {
    ErrorDto::new(CODE_STALE_PLAN, "the plan was replaced by a newer preview")
        .with_hint(HINT_STALE_PLAN)
}

fn translation_in_progress() -> ErrorDto {
    ErrorDto::new(CODE_TRANSLATION_IN_PROGRESS, "a translation is already running")
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::Write;
    use std::sync::Mutex;

    use async_trait::async_trait;
    use subx_core::config::{TestConfigBuilder, TestConfigService};
    use subx_core::services::ai::{AnalysisRequest, ConfidenceScore, MatchResult, VerificationRequest};
    use tempfile::TempDir;

    use super::*;

    const SRT: &str = "1\n00:00:01,000 --> 00:00:02,000\nhello\n\n2\n00:00:03,000 --> 00:00:04,000\nworld\n\n";

    // ─── Test doubles and builders ──────────────────────────────────────────

    fn service() -> Arc<dyn ConfigService> {
        Arc::new(
            TestConfigBuilder::new()
                .with_ai_provider("openai")
                .with_ai_model("gpt-4.1-mini")
                .with_ai_api_key("sk-test-value-1234")
                .with_translation_default_target_language("zh-TW")
                .build_service(),
        )
    }

    fn options(
        target_language: Option<&str>,
        output_mode: TranslateOutputModeDto,
        overwrite: bool,
    ) -> TranslateOptionsDto {
        TranslateOptionsDto {
            target_language: target_language.map(str::to_string),
            source_language: None,
            context: None,
            glossary_text: None,
            output_mode,
            overwrite,
        }
    }

    /// Echoes each cue's id back with its text upper-cased, and records the
    /// terminology-extraction prompt so glossary-reaching tests can assert on
    /// it without parsing JSON by hand.
    struct ScriptedAi {
        terminology_prompts: Mutex<Vec<String>>,
        /// Cue ids to omit from the translation response, forcing the engine's
        /// missing-cue retry and — if still missing after the retry — its
        /// empty-string fallback.
        drop_ids: Vec<usize>,
    }

    impl ScriptedAi {
        fn new() -> Arc<Self> {
            Arc::new(Self {
                terminology_prompts: Mutex::new(Vec::new()),
                drop_ids: Vec::new(),
            })
        }

        fn dropping_every_cue() -> Arc<Self> {
            Arc::new(Self {
                terminology_prompts: Mutex::new(Vec::new()),
                drop_ids: vec![0],
            })
        }
    }

    fn extract_ids(prompt: &str) -> Vec<String> {
        prompt
            .lines()
            .filter_map(|line| line.trim().strip_prefix("- id: "))
            .map(|id| id.trim().to_string())
            .collect()
    }

    #[async_trait]
    impl AIProvider for ScriptedAi {
        async fn analyze_content(&self, _r: AnalysisRequest) -> subx_core::Result<MatchResult> {
            unimplemented!("the translate flow never matches")
        }

        async fn verify_match(&self, _v: VerificationRequest) -> subx_core::Result<ConfidenceScore> {
            unimplemented!("the translate flow never verifies")
        }

        async fn chat_completion(&self, messages: Vec<serde_json::Value>) -> subx_core::Result<String> {
            let prompt = messages
                .last()
                .and_then(|m| m.get("content"))
                .and_then(|c| c.as_str())
                .unwrap_or("")
                .to_string();
            let ids = extract_ids(&prompt);

            // The terminology pass has no per-cue `- id:` lines shaped like the
            // translation batch prompt; route on whether any were found.
            if ids.is_empty() {
                self.terminology_prompts.lock().unwrap().push(prompt);
                return Ok(r#"{"terms":[]}"#.to_string());
            }

            let translations: Vec<String> = ids
                .iter()
                .enumerate()
                .filter(|(index, _)| !self.drop_ids.contains(index))
                .map(|(_, id)| format!(r#"{{"id":"{id}","text":"[{id}]"}}"#))
                .collect();
            Ok(format!(r#"{{"translations":[{}]}}"#, translations.join(",")))
        }
    }

    struct ScriptedAiFactory {
        provider: Arc<ScriptedAi>,
    }
    impl AiProviderFactory for ScriptedAiFactory {
        fn create_provider(&self, _service: &dyn ConfigService) -> Result<Arc<dyn AIProvider>, ErrorDto> {
            Ok(self.provider.clone())
        }
    }

    /// A factory that fails exactly as `create_ai_provider` does with no config.
    struct UnconfiguredAiFactory;
    impl AiProviderFactory for UnconfiguredAiFactory {
        fn create_provider(&self, _service: &dyn ConfigService) -> Result<Arc<dyn AIProvider>, ErrorDto> {
            Err(map_provider_error(SubXError::config("no provider configured")))
        }
    }

    #[derive(Default)]
    struct RecordingReporter {
        seen: Mutex<Vec<TranslateProgress>>,
    }
    impl TranslateReporter for RecordingReporter {
        fn report(&self, progress: TranslateProgress) {
            self.seen.lock().unwrap().push(progress);
        }
    }
    impl RecordingReporter {
        fn seen(&self) -> Vec<TranslateProgress> {
            self.seen.lock().unwrap().clone()
        }
    }

    /// Sends on its own `watch::Sender` as soon as the second file reports
    /// its terminology phase — synchronously, before that file's translation
    /// begins, so there is no scheduling race with the batch's own
    /// single-threaded worker (unlike routing through `TranslateState::cancel`,
    /// which needs an async lock and would race the loop instead of
    /// deterministically landing mid-file, per design D3's stronger
    /// guarantee). Keyed on the file and phase, not on a report count, so a
    /// finer progress stream does not move the cancel point.
    struct CancelOnSecondFile {
        tx: watch::Sender<bool>,
    }
    impl TranslateReporter for CancelOnSecondFile {
        fn report(&self, progress: TranslateProgress) {
            if progress.index == 2 && progress.stage == TranslateStage::Terminology {
                let _ = self.tx.send(true);
            }
        }
    }

    /// Records every snapshot and cancels the run the moment the second file's
    /// first batch is in flight, i.e. while the engine is mid-request.
    struct CancelOnSecondFileBatch {
        tx: watch::Sender<bool>,
        seen: Mutex<Vec<TranslateProgress>>,
    }
    impl TranslateReporter for CancelOnSecondFileBatch {
        fn report(&self, progress: TranslateProgress) {
            if progress.index == 2
                && progress.stage == TranslateStage::Translating
                && progress.batch_in_flight == 1
            {
                let _ = self.tx.send(true);
            }
            self.seen.lock().unwrap().push(progress);
        }
    }

    /// Echoes like [`ScriptedAi`] but yields to the runtime before answering,
    /// as a real HTTP request would, so a cancel sent while a batch is in
    /// flight can win the race. Counts the translation requests it answered.
    struct YieldingAi {
        answered: Mutex<Vec<String>>,
    }
    #[async_trait]
    impl AIProvider for YieldingAi {
        async fn analyze_content(&self, _r: AnalysisRequest) -> subx_core::Result<MatchResult> {
            unimplemented!()
        }
        async fn verify_match(&self, _v: VerificationRequest) -> subx_core::Result<ConfidenceScore> {
            unimplemented!()
        }
        async fn chat_completion(&self, messages: Vec<serde_json::Value>) -> subx_core::Result<String> {
            tokio::task::yield_now().await;
            let prompt = last_prompt(&messages);
            let ids = extract_ids(&prompt);
            if ids.is_empty() {
                return Ok(r#"{"terms":[]}"#.to_string());
            }
            self.answered.lock().unwrap().push(prompt);
            Ok(echo(&ids))
        }
    }

    /// Answers the first translation request with a cue ID that was never
    /// sent, which makes the engine discard the response and resend the batch.
    struct UnknownIdOnceAi {
        sent_bogus: Mutex<bool>,
    }
    #[async_trait]
    impl AIProvider for UnknownIdOnceAi {
        async fn analyze_content(&self, _r: AnalysisRequest) -> subx_core::Result<MatchResult> {
            unimplemented!()
        }
        async fn verify_match(&self, _v: VerificationRequest) -> subx_core::Result<ConfidenceScore> {
            unimplemented!()
        }
        async fn chat_completion(&self, messages: Vec<serde_json::Value>) -> subx_core::Result<String> {
            let ids = extract_ids(&last_prompt(&messages));
            if ids.is_empty() {
                return Ok(r#"{"terms":[]}"#.to_string());
            }
            let mut sent_bogus = self.sent_bogus.lock().unwrap();
            if !*sent_bogus {
                *sent_bogus = true;
                return Ok(r#"{"translations":[{"id":"no-such-cue","text":"x"}]}"#.to_string());
            }
            Ok(echo(&ids))
        }
    }

    /// Hands one fixed provider to the batch.
    struct FixedFactory(Arc<dyn AIProvider>);
    impl AiProviderFactory for FixedFactory {
        fn create_provider(&self, _s: &dyn ConfigService) -> Result<Arc<dyn AIProvider>, ErrorDto> {
            Ok(Arc::clone(&self.0))
        }
    }

    fn last_prompt(messages: &[serde_json::Value]) -> String {
        messages
            .last()
            .and_then(|m| m.get("content"))
            .and_then(|c| c.as_str())
            .unwrap_or("")
            .to_string()
    }

    fn echo(ids: &[String]) -> String {
        let translations: Vec<String> =
            ids.iter().map(|id| format!(r#"{{"id":"{id}","text":"[{id}]"}}"#)).collect();
        format!(r#"{{"translations":[{}]}}"#, translations.join(","))
    }

    /// An SRT with `count` one-second cues.
    fn srt_with(count: usize) -> String {
        (0..count)
            .map(|i| {
                format!(
                    "{}\n00:{:02}:{:02},000 --> 00:{:02}:{:02},500\ncue {i}\n\n",
                    i + 1,
                    i / 60,
                    i % 60,
                    i / 60,
                    i % 60
                )
            })
            .collect()
    }

    fn service_with_batch_size(batch_size: usize) -> Arc<dyn ConfigService> {
        Arc::new(
            TestConfigBuilder::new()
                .with_ai_provider("openai")
                .with_ai_model("gpt-4.1-mini")
                .with_ai_api_key("sk-test-value-1234")
                .with_translation_default_target_language("zh-TW")
                .with_translation_batch_size(batch_size)
                .build_service(),
        )
    }

    /// One snapshot reduced to the fields the progress scenarios are about.
    #[derive(Debug, PartialEq)]
    struct Step {
        index: u32,
        stage: TranslateStage,
        batch_in_flight: u32,
        batches_done: u32,
        resend: bool,
        processed: u32,
        outcome: Option<TranslationStatusDto>,
    }

    fn steps(progress: &[TranslateProgress]) -> Vec<Step> {
        progress
            .iter()
            .map(|p| Step {
                index: p.index,
                stage: p.stage.clone(),
                batch_in_flight: p.batch_in_flight,
                batches_done: p.batches_done,
                resend: p.resend,
                processed: p.processed_cues,
                outcome: p.outcome.clone(),
            })
            .collect()
    }

    fn step(index: u32, stage: TranslateStage, in_flight: u32, done: u32, processed: u32) -> Step {
        Step {
            index,
            stage,
            batch_in_flight: in_flight,
            batches_done: done,
            resend: false,
            processed,
            outcome: None,
        }
    }

    /// Previews `paths` and runs `ids` (all when `None`) with `factory`,
    /// returning the report and every recorded snapshot.
    async fn run_recorded(
        service: Arc<dyn ConfigService>,
        paths: Vec<PathBuf>,
        factory: Arc<dyn AiProviderFactory>,
        ids: Option<Vec<u32>>,
    ) -> (TranslationReportDto, Vec<TranslateProgress>) {
        let state = Arc::new(TranslateState::default());
        let reporter = Arc::new(RecordingReporter::default());
        let plan = preview(
            &service,
            &state,
            paths,
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .unwrap();
        let ids = ids.unwrap_or_else(|| all_ids(&plan));
        let report = execute_translation_impl(
            service,
            state,
            factory,
            reporter.clone(),
            &plan.plan_id,
            &ids,
        )
        .await
        .expect("the batch must run");
        (report, reporter.seen())
    }

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

    async fn preview(
        service: &Arc<dyn ConfigService>,
        state: &Arc<TranslateState>,
        paths: Vec<PathBuf>,
        options: TranslateOptionsDto,
    ) -> Result<TranslatePlanDto, ErrorDto> {
        preview_translation_impl(
            service.as_ref(),
            Arc::clone(state),
            paths,
            options,
            is_portal_document_entry,
        )
        .await
    }

    /// Stand-in portal guards: a real one keys off `/run/user/<uid>/doc/…`,
    /// which no test can create, so these name the output instead.
    fn blocks_movie_zh_tw_output(path: &Path) -> bool {
        path.file_name().is_some_and(|name| name == "movie.zh-TW.srt")
    }

    fn blocks_movie_srt_replace(path: &Path) -> bool {
        path.file_name().is_some_and(|name| name == "movie.srt")
    }

    /// Every item's id, i.e. "translate everything the plan offers".
    fn all_ids(plan: &TranslatePlanDto) -> Vec<u32> {
        plan.items.iter().map(|item| item.id).collect()
    }

    fn item_named<'a>(plan: &'a TranslatePlanDto, name: &str) -> &'a TranslateItemDto {
        plan.items
            .iter()
            .find(|item| item.input_name == name)
            .unwrap_or_else(|| panic!("the plan must contain {name}: {:?}", plan.items))
    }

    /// A configuration with an AI provider but no default target language —
    /// the out-of-the-box state, since `translation.default_target_language`
    /// defaults to `None`.
    fn service_without_default_language() -> Arc<dyn ConfigService> {
        Arc::new(
            TestConfigBuilder::new()
                .with_ai_provider("openai")
                .with_ai_model("gpt-4.1-mini")
                .with_ai_api_key("sk-test-value-1234")
                .without_translation_default_target_language()
                .build_service(),
        )
    }

    // ─── Scan ───────────────────────────────────────────────────────────────

    // @covers translate-workflow/multi-source-selection-with-cue-count-preview#mixed-sources-are-scanned-with-cue-counts
    #[test]
    fn the_scan_lists_every_subtitle_with_its_cue_count() {
        let dir = TempDir::new().unwrap();
        let folder = dir.path().join("media");
        fs::create_dir(&folder).unwrap();
        fs::write(folder.join("episode.srt"), SRT).unwrap();
        let loose = dir.path().join("loose.srt");
        fs::write(&loose, SRT).unwrap();
        let archive = dir.path().join("bundle.zip");
        write_zip(&archive, &[("archived.srt", SRT)]);

        let scan = scan_translate_inputs(service().as_ref(), &[folder, loose, archive])
            .expect("the scan must succeed");

        assert_eq!(scan.files.len(), 3);
        for file in &scan.files {
            assert_eq!(file.cue_count, 2, "{file:?}");
            assert!(!file.unparsable, "{file:?}");
        }
    }

    /// The regression this whole scan command exists for: Step 1 gathers
    /// sources before Step 2 offers anywhere to type a target language, so a
    /// scan that demanded one would dead-end the wizard on a fresh install.
    // @covers translate-workflow/multi-source-selection-with-cue-count-preview#scanning-does-not-require-a-target-language
    #[test]
    fn the_scan_succeeds_without_any_target_language_configured() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("episode.srt"), SRT).unwrap();

        let scan = scan_translate_inputs(
            service_without_default_language().as_ref(),
            &[dir.path().to_path_buf()],
        )
        .expect("scanning must not depend on a target language");

        assert_eq!(scan.files.len(), 1);
        assert_eq!(scan.default_target_language, None);
    }

    // @covers translate-workflow/translation-options-seeded-from-shared-configuration#target-language-prefilled-from-configuration
    #[test]
    fn the_scan_reports_the_configured_default_target_language() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("episode.srt"), SRT).unwrap();

        let scan = scan_translate_inputs(service().as_ref(), &[dir.path().to_path_buf()])
            .expect("the scan must succeed");

        assert_eq!(scan.default_target_language.as_deref(), Some("zh-TW"));
    }

    // @covers translate-workflow/multi-source-selection-with-cue-count-preview#no-subtitles-block-progress
    #[test]
    fn a_scan_without_subtitles_is_rejected() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("episode.mkv"), b"video").unwrap();

        let error = scan_translate_inputs(service().as_ref(), &[dir.path().to_path_buf()])
            .expect_err("a scan with no subtitles must be rejected");

        assert_eq!(error.code, CODE_NO_SUBTITLES);
        assert_eq!(error.hint_code.as_deref(), Some(HINT_NO_SUBTITLES));
    }

    // @covers translate-workflow/multi-source-selection-with-cue-count-preview#unparsable-file-is-flagged-and-excluded
    #[test]
    fn the_scan_flags_an_unparsable_file_and_keeps_the_others() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("broken.srt"), "not a subtitle at all").unwrap();
        fs::write(dir.path().join("good.srt"), SRT).unwrap();

        let scan = scan_translate_inputs(service().as_ref(), &[dir.path().to_path_buf()])
            .expect("the scan must succeed");

        let broken = scan
            .files
            .iter()
            .find(|file| file.name == "broken.srt")
            .expect("the unparsable file must still be listed");
        assert!(broken.unparsable);
        assert_eq!(broken.cue_count, 0);

        let good = scan
            .files
            .iter()
            .find(|file| file.name == "good.srt")
            .expect("the parsable file must be listed");
        assert!(!good.unparsable);
        assert_eq!(good.cue_count, 2);
    }

    fn sources_by_name(scan: &TranslateScanResult) -> Vec<(String, String)> {
        scan.files.iter().map(|f| (f.name.clone(), f.source.clone())).collect()
    }

    // @covers translate-workflow/multi-source-selection-with-cue-count-preview#each-scan-item-names-its-source
    #[test]
    fn each_scan_item_names_the_source_that_produced_it() {
        let dir = TempDir::new().unwrap();
        let folder = dir.path().join("media");
        fs::create_dir(&folder).unwrap();
        fs::write(folder.join("episode.srt"), SRT).unwrap();
        let loose = dir.path().join("loose.srt");
        fs::write(&loose, SRT).unwrap();
        let archive = dir.path().join("bundle.zip");
        write_zip(&archive, &[("archived.srt", SRT)]);

        let scan = scan_translate_inputs(service().as_ref(), &[loose.clone(), folder.clone(), archive.clone()])
            .expect("the scan must succeed");

        let text = |path: &Path| path.to_string_lossy().to_string();
        assert_eq!(
            sources_by_name(&scan),
            [
                ("loose.srt".to_string(), text(&loose)),
                ("episode.srt".to_string(), text(&folder)),
                ("archived.srt".to_string(), text(&archive)),
            ]
        );
    }

    // @covers translate-workflow/multi-source-selection-with-cue-count-preview#a-file-reachable-through-two-sources-is-listed-once
    #[test]
    fn a_file_added_directly_and_through_its_folder_is_listed_once() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("one.srt");
        fs::write(&file, SRT).unwrap();
        fs::write(dir.path().join("two.srt"), SRT).unwrap();
        let folder = dir.path().to_path_buf();
        let text = |path: &Path| path.to_string_lossy().to_string();

        let direct_first = scan_translate_inputs(service().as_ref(), &[file.clone(), folder.clone()]).unwrap();
        let mut listed = sources_by_name(&direct_first);
        listed.sort();
        assert_eq!(
            listed,
            [("one.srt".to_string(), text(&file)), ("two.srt".to_string(), text(&folder))]
        );

        // The first source that produced the file wins, so the folder does
        // when it was added first.
        let folder_first = scan_translate_inputs(service().as_ref(), &[folder.clone(), file.clone()]).unwrap();
        let mut listed = sources_by_name(&folder_first);
        listed.sort();
        assert_eq!(
            listed,
            [("one.srt".to_string(), text(&folder)), ("two.srt".to_string(), text(&folder))]
        );
    }

    #[test]
    fn nested_folder_sources_yield_each_file_once() {
        let dir = TempDir::new().unwrap();
        let inner = dir.path().join("inner");
        fs::create_dir(&inner).unwrap();
        fs::write(dir.path().join("outer.srt"), SRT).unwrap();
        fs::write(inner.join("inner.srt"), SRT).unwrap();

        let scan = scan_translate_inputs(service().as_ref(), &[dir.path().to_path_buf(), inner]).unwrap();

        let mut names: Vec<String> = scan.files.iter().map(|f| f.name.clone()).collect();
        names.sort();
        assert_eq!(names, ["inner.srt", "outer.srt"]);
        assert!(scan.files.iter().all(|f| f.source == dir.path().to_string_lossy()));
    }

    #[tokio::test]
    async fn the_plan_lists_a_file_reachable_through_two_sources_once() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("one.srt");
        fs::write(&file, SRT).unwrap();

        let plan = preview(
            &service(),
            &Arc::new(TranslateState::default()),
            vec![file, dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .unwrap();

        assert_eq!(plan.items.len(), 1, "{:?}", plan.items);
        assert_eq!(plan.items[0].skip_reason, None);
    }

    #[test]
    fn a_file_matching_no_source_falls_back_to_its_parent_folder() {
        let dir = TempDir::new().unwrap();
        let elsewhere = dir.path().join("elsewhere");
        fs::create_dir(&elsewhere).unwrap();
        let file = elsewhere.join("stray.srt");
        fs::write(&file, SRT).unwrap();
        let unrelated = dir.path().join("unrelated");
        fs::create_dir(&unrelated).unwrap();
        let collected = collect_input_files(std::slice::from_ref(&unrelated)).unwrap();

        let source = attribute_source(&file, &SourceKeys::new(&[unrelated]), &collected);

        assert_eq!(source, elsewhere.to_string_lossy());
    }

    // ─── Preview ────────────────────────────────────────────────────────────

    #[tokio::test]
    async fn preview_lists_every_subtitle_with_its_cue_count() {
        let dir = TempDir::new().unwrap();
        let folder = dir.path().join("media");
        fs::create_dir(&folder).unwrap();
        fs::write(folder.join("episode.srt"), SRT).unwrap();
        let loose = dir.path().join("loose.srt");
        fs::write(&loose, SRT).unwrap();
        let archive = dir.path().join("bundle.zip");
        write_zip(&archive, &[("archived.srt", SRT)]);

        let plan = preview(
            &service(),
            &Arc::new(TranslateState::default()),
            vec![folder, loose, archive],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .expect("the preview must succeed");

        assert_eq!(plan.items.len(), 3);
        for item in &plan.items {
            assert_eq!(item.cue_count, 2, "{item:?}");
        }
    }

    /// The preview enforces the same rule as the scan: the wizard blocks
    /// first, but the backend is the boundary.
    #[tokio::test]
    async fn a_preview_without_subtitles_is_rejected() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("episode.mkv"), b"video").unwrap();

        let error = preview(
            &service(),
            &Arc::new(TranslateState::default()),
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .expect_err("a scan with no subtitles must be rejected");

        assert_eq!(error.code, CODE_NO_SUBTITLES);
        assert_eq!(error.hint_code.as_deref(), Some(HINT_NO_SUBTITLES));
    }

    // @covers translate-workflow/multi-source-selection-with-cue-count-preview#unparsable-file-is-flagged-and-excluded
    #[tokio::test]
    async fn an_unparsable_file_is_flagged_and_excluded_while_others_remain() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("broken.srt"), "not a subtitle at all").unwrap();
        fs::write(dir.path().join("good.srt"), SRT).unwrap();

        let plan = preview(
            &service(),
            &Arc::new(TranslateState::default()),
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .expect("the preview must succeed");

        let broken = item_named(&plan, "broken.srt");
        assert_eq!(broken.skip_reason.as_deref(), Some(CODE_UNPARSABLE));
        assert_eq!(broken.cue_count, 0);
        let good = item_named(&plan, "good.srt");
        assert_eq!(good.skip_reason, None);
        assert_eq!(good.cue_count, 2);
    }

    // @covers translate-workflow/translation-options-seeded-from-shared-configuration#target-language-prefilled-from-configuration
    #[tokio::test]
    async fn an_absent_target_language_resolves_from_the_configuration() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("episode.srt"), SRT).unwrap();

        let plan = preview(
            &service(),
            &Arc::new(TranslateState::default()),
            vec![dir.path().to_path_buf()],
            options(None, TranslateOutputModeDto::Suffix, false),
        )
        .await
        .expect("the preview must succeed");

        assert_eq!(plan.target_language, "zh-TW");
        assert!(
            plan.items[0].output_path.ends_with("episode.zh-TW.srt"),
            "the configured default must drive the paths too: {:?}",
            plan.items[0]
        );
    }

    // @covers translate-workflow/translation-options-seeded-from-shared-configuration#missing-target-language-blocks-progress
    #[tokio::test]
    async fn no_configured_and_no_per_run_target_language_is_rejected() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("episode.srt"), SRT).unwrap();
        let service: Arc<dyn ConfigService> = Arc::new(TestConfigService::with_ai_settings_and_key(
            "openai",
            "gpt-4.1-mini",
            "sk-test-value-1234",
        ));

        let error = preview(
            &service,
            &Arc::new(TranslateState::default()),
            vec![dir.path().to_path_buf()],
            options(None, TranslateOutputModeDto::Suffix, false),
        )
        .await
        .expect_err("no target language anywhere must be rejected");

        assert_eq!(error.code, CODE_NO_TARGET_LANGUAGE);
        assert_eq!(error.hint_code.as_deref(), Some(HINT_NO_TARGET_LANGUAGE));
    }

    // @covers translate-workflow/output-resolution-with-conflict-handling#default-suffix-naming
    #[tokio::test]
    async fn suffix_mode_names_the_output_with_stem_language_and_extension() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("movie.srt"), SRT).unwrap();

        let plan = preview(
            &service(),
            &Arc::new(TranslateState::default()),
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .unwrap();

        assert_eq!(
            PathBuf::from(&plan.items[0].output_path),
            dir.path().join("movie.zh-TW.srt")
        );
    }

    // @covers translate-workflow/output-resolution-with-conflict-handling#archive-extracted-output-lands-beside-the-archive
    #[tokio::test]
    async fn an_archive_extracted_output_is_written_beside_the_archive() {
        let dir = TempDir::new().unwrap();
        let archive = dir.path().join("season1.zip");
        write_zip(&archive, &[("episode.srt", SRT)]);

        let plan = preview(
            &service(),
            &Arc::new(TranslateState::default()),
            vec![archive],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .unwrap();

        assert_eq!(
            PathBuf::from(&plan.items[0].output_path),
            dir.path().join("episode.zh-TW.srt"),
            "an extracted file's output must not stay in the extraction directory"
        );
    }

    // @covers translate-workflow/output-resolution-with-conflict-handling#replace-mode-is-refused-for-archive-extracted-files
    #[tokio::test]
    async fn replace_mode_is_refused_for_an_archive_extracted_subtitle() {
        let dir = TempDir::new().unwrap();
        let archive = dir.path().join("season1.zip");
        write_zip(&archive, &[("episode.srt", SRT)]);

        let plan = preview(
            &service(),
            &Arc::new(TranslateState::default()),
            vec![archive],
            options(Some("zh-TW"), TranslateOutputModeDto::Replace, false),
        )
        .await
        .unwrap();

        assert_eq!(
            plan.items[0].skip_reason.as_deref(),
            Some(CODE_REPLACE_ARCHIVE_FORBIDDEN)
        );
    }

    // @covers translate-workflow/output-resolution-with-conflict-handling#existing-output-is-excluded-unless-overwrite-is-enabled
    #[tokio::test]
    async fn an_existing_suffix_output_is_excluded_unless_overwrite_is_enabled() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("movie.srt"), SRT).unwrap();
        // Valid SRT, not garbage: the "existing output" file is itself scanned
        // as a subtitle source (its extension matches), so it must parse
        // cleanly or it would independently earn `translate.unparsable`.
        fs::write(dir.path().join("movie.zh-TW.srt"), SRT).unwrap();

        let blocked = preview(
            &service(),
            &Arc::new(TranslateState::default()),
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .unwrap();
        let item = item_named(&blocked, "movie.srt");
        assert_eq!(item.skip_reason.as_deref(), Some(CODE_OUTPUT_EXISTS));
        assert!(item.output_exists);

        let allowed = preview(
            &service(),
            &Arc::new(TranslateState::default()),
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, true),
        )
        .await
        .unwrap();
        let item = item_named(&allowed, "movie.srt");
        assert_eq!(item.skip_reason, None, "overwrite re-includes it");
        assert!(item.output_exists);
    }

    // @covers portal-path-safety/convert-and-translate-previews-exclude-outputs-that-are-portal-document-entries#a-translate-preview-keeps-the-exclusion-when-overwrite-is-enabled
    #[tokio::test]
    async fn a_translate_preview_keeps_the_exclusion_when_overwrite_is_enabled() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("movie.srt"), SRT).unwrap();
        // Without the guard this existing output plus `overwrite` re-includes
        // the item, as the test above shows.
        fs::write(dir.path().join("movie.zh-TW.srt"), SRT).unwrap();

        let plan = preview_translation_impl(
            service().as_ref(),
            Arc::new(TranslateState::default()),
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, true),
            blocks_movie_zh_tw_output,
        )
        .await
        .expect("the preview must succeed");

        // The existing output is itself scanned as a second input; the
        // guarded item is the one whose output it is.
        let item = item_named(&plan, "movie.srt");
        assert_eq!(
            item.skip_reason.as_deref(),
            Some(CODE_PORTAL_DOCUMENT_TARGET)
        );
        assert!(!item.output_exists);
    }

    // @covers portal-path-safety/convert-and-translate-previews-exclude-outputs-that-are-portal-document-entries#translate-replace-mode-is-excluded
    #[tokio::test]
    async fn translate_replace_mode_is_excluded() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("movie.srt"), SRT).unwrap();

        let plan = preview_translation_impl(
            service().as_ref(),
            Arc::new(TranslateState::default()),
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Replace, false),
            blocks_movie_srt_replace,
        )
        .await
        .expect("the preview must succeed");

        assert_eq!(
            item_named(&plan, "movie.srt").skip_reason.as_deref(),
            Some(CODE_PORTAL_DOCUMENT_TARGET)
        );
    }

    // @covers translate-workflow/output-resolution-with-conflict-handling#colliding-output-paths-are-excluded
    #[tokio::test]
    async fn only_the_first_of_two_archive_entries_sharing_a_basename_is_executable() {
        let dir = TempDir::new().unwrap();
        let archive = dir.path().join("season1.zip");
        write_zip(
            &archive,
            &[("S01E01/subtitle.srt", SRT), ("S01E02/subtitle.srt", SRT)],
        );

        let plan = preview(
            &service(),
            &Arc::new(TranslateState::default()),
            vec![archive],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .unwrap();

        let runnable: Vec<&TranslateItemDto> =
            plan.items.iter().filter(|item| item.skip_reason.is_none()).collect();
        assert_eq!(runnable.len(), 1, "one output path, one runnable item");
        let excluded: Vec<&TranslateItemDto> = plan
            .items
            .iter()
            .filter(|item| item.skip_reason.as_deref() == Some(CODE_OUTPUT_COLLISION))
            .collect();
        assert_eq!(excluded.len(), 1);
        assert_eq!(excluded[0].output_path, runnable[0].output_path);
    }

    // ─── Execution ──────────────────────────────────────────────────────────

    // @covers translate-workflow/batch-execution-with-per-file-progress-cancellation-and-per-item-report#per-file-progress-is-reported
    // @covers translate-workflow/batch-execution-with-per-file-progress-cancellation-and-per-item-report#timing-survives-translation
    #[tokio::test]
    async fn a_batch_translates_every_selected_file_preserving_timing_and_cue_count() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("one.srt"), SRT).unwrap();
        fs::write(dir.path().join("two.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(TranslateState::default());
        let reporter = Arc::new(RecordingReporter::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .unwrap();
        let report = execute_translation_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(ScriptedAiFactory { provider: ScriptedAi::new() }),
            reporter.clone(),
            &plan.plan_id,
            &all_ids(&plan),
        )
        .await
        .expect("the batch must run");

        assert_eq!(report.success_count, 2, "{:?}", report.outcomes);
        assert_eq!(report.failure_count, 0);
        assert!(!report.cancelled);
        let output = fs::read_to_string(dir.path().join("one.zh-TW.srt")).unwrap();
        assert!(output.contains("00:00:01,000 --> 00:00:02,000"), "{output}");
        assert_eq!(output.matches("-->").count(), 2, "the cue count must survive");

        let progress = reporter.seen();
        // Scan order follows the directory listing, so names are compared as
        // a set while positions are compared in order.
        let starts: Vec<(u32, u32)> = progress
            .iter()
            .filter(|entry| entry.stage == TranslateStage::Terminology)
            .map(|entry| (entry.index, entry.total))
            .collect();
        assert_eq!(starts, [(1, 2), (2, 2)]);
        let mut names: Vec<&str> = progress
            .iter()
            .filter(|entry| entry.stage == TranslateStage::Terminology)
            .map(|entry| entry.file_name.as_str())
            .collect();
        names.sort();
        assert_eq!(names, ["one.srt", "two.srt"]);
        for index in [1, 2] {
            // Two cues fit one batch: it goes in flight, then returns.
            let batches: Vec<(u32, u32)> = progress
                .iter()
                .filter(|entry| entry.index == index && entry.stage == TranslateStage::Translating)
                .map(|entry| (entry.batch_in_flight, entry.batches_done))
                .collect();
            assert_eq!(batches, [(1, 0), (0, 1)], "file {index}: {progress:?}");
        }
        assert_eq!(
            progress.last().map(|entry| entry.stage.clone()),
            Some(TranslateStage::Finished)
        );
        assert!(!state.is_running().await, "the execution slot must be released");
    }

    // @covers translate-workflow/translation-options-seeded-from-shared-configuration#glossary-lines-reach-the-translation-request
    #[tokio::test]
    async fn glossary_lines_reach_the_terminology_prompt() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("one.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(TranslateState::default());
        let provider = ScriptedAi::new();

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            TranslateOptionsDto {
                glossary_text: Some("Alice = 愛麗絲".to_string()),
                ..options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false)
            },
        )
        .await
        .unwrap();
        execute_translation_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(ScriptedAiFactory { provider: provider.clone() }),
            Arc::new(RecordingReporter::default()),
            &plan.plan_id,
            &all_ids(&plan),
        )
        .await
        .unwrap();

        let prompts = provider.terminology_prompts.lock().unwrap();
        assert!(
            prompts.iter().any(|prompt| prompt.contains("Alice") && prompt.contains("愛麗絲")),
            "the glossary text must reach the terminology prompt: {prompts:?}"
        );
    }

    // @covers translate-workflow/output-resolution-with-conflict-handling#replace-mode-backs-up-when-enabled
    #[tokio::test]
    async fn replace_mode_backs_up_the_original_when_backups_are_enabled() {
        let dir = TempDir::new().unwrap();
        let path = dir.path().join("movie.srt");
        fs::write(&path, SRT).unwrap();
        let service: Arc<dyn ConfigService> = Arc::new(
            TestConfigBuilder::new()
                .with_ai_provider("openai")
                .with_ai_model("gpt-4.1-mini")
                .with_ai_api_key("sk-test-value-1234")
                .with_translation_default_target_language("zh-TW")
                .with_backup_enabled(true)
                .build_service(),
        );
        let state = Arc::new(TranslateState::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Replace, false),
        )
        .await
        .unwrap();
        let report = execute_translation_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(ScriptedAiFactory { provider: ScriptedAi::new() }),
            Arc::new(RecordingReporter::default()),
            &plan.plan_id,
            &all_ids(&plan),
        )
        .await
        .unwrap();

        assert_eq!(report.success_count, 1, "{:?}", report.outcomes);
        let backup = fs::read_to_string(dir.path().join("movie.srt.backup")).unwrap();
        assert!(backup.contains("hello"), "the backup must hold the original text: {backup}");
        let replaced = fs::read_to_string(&path).unwrap();
        assert!(
            replaced.contains('['),
            "the replaced file must hold the translated text: {replaced}"
        );
        assert!(
            report.outcomes[0].backup_path.as_deref().is_some_and(|p| p.ends_with("movie.srt.backup")),
            "{:?}",
            report.outcomes[0]
        );
    }

    // @covers translate-workflow/batch-execution-with-per-file-progress-cancellation-and-per-item-report#per-file-failure-does-not-abort
    #[tokio::test]
    async fn one_ai_failure_does_not_stop_the_others() {
        /// Fails any request whose prompt echoes the marker cue text, which
        /// only `broken.srt`'s content contains — so `good.srt`'s terminology
        /// and translation calls (sharing the same provider instance) still
        /// succeed, proving isolation is per file, not per provider call.
        struct FailOnKeyword;
        #[async_trait]
        impl AIProvider for FailOnKeyword {
            async fn analyze_content(&self, _r: AnalysisRequest) -> subx_core::Result<MatchResult> {
                unimplemented!()
            }
            async fn verify_match(&self, _v: VerificationRequest) -> subx_core::Result<ConfidenceScore> {
                unimplemented!()
            }
            async fn chat_completion(&self, messages: Vec<serde_json::Value>) -> subx_core::Result<String> {
                let prompt = messages
                    .last()
                    .and_then(|m| m.get("content"))
                    .and_then(|c| c.as_str())
                    .unwrap_or("")
                    .to_string();
                if prompt.contains("BREAKME") {
                    return Err(SubXError::ai_service("scripted failure"));
                }
                let ids = extract_ids(&prompt);
                if ids.is_empty() {
                    return Ok(r#"{"terms":[]}"#.to_string());
                }
                let translations: Vec<String> =
                    ids.iter().map(|id| format!(r#"{{"id":"{id}","text":"[{id}]"}}"#)).collect();
                Ok(format!(r#"{{"translations":[{}]}}"#, translations.join(",")))
            }
        }
        struct KeywordFactory;
        impl AiProviderFactory for KeywordFactory {
            fn create_provider(&self, _s: &dyn ConfigService) -> Result<Arc<dyn AIProvider>, ErrorDto> {
                Ok(Arc::new(FailOnKeyword))
            }
        }

        let dir = TempDir::new().unwrap();
        fs::write(
            dir.path().join("broken.srt"),
            "1\n00:00:01,000 --> 00:00:02,000\nBREAKME\n\n",
        )
        .unwrap();
        fs::write(dir.path().join("good.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(TranslateState::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .unwrap();
        let report = execute_translation_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(KeywordFactory),
            Arc::new(RecordingReporter::default()),
            &plan.plan_id,
            &all_ids(&plan),
        )
        .await
        .unwrap();

        assert_eq!(report.success_count, 1, "{:?}", report.outcomes);
        assert_eq!(report.failure_count, 1);
        let failed = report
            .outcomes
            .iter()
            .find(|outcome| outcome.status == TranslationStatusDto::Failed)
            .expect("the marked file must be reported as failed");
        assert_eq!(failed.input_name, "broken.srt");
        assert!(failed.error.is_some());
        assert!(dir.path().join("good.zh-TW.srt").exists());
        assert!(!dir.path().join("broken.zh-TW.srt").exists());
    }

    // @covers translate-workflow/batch-execution-with-per-file-progress-cancellation-and-per-item-report#cancellation-abandons-only-unfinished-work
    #[tokio::test]
    async fn cancelling_mid_batch_keeps_finished_outputs_and_abandons_the_in_flight_file() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("one.srt"), SRT).unwrap();
        fs::write(dir.path().join("two.srt"), SRT).unwrap();
        fs::write(dir.path().join("three.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(TranslateState::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .unwrap();
        let (tx, rx) = watch::channel(false);
        let reporter = Arc::new(CancelOnSecondFile { tx });

        // Drives `run_batch` directly rather than through
        // `execute_translation_impl`, so the test owns the `watch::Sender` the
        // reporter sends on — bypassing `TranslateState`'s async-locked
        // `cancel()`, which cannot be called synchronously from `report()`.
        let report = run_batch(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(ScriptedAiFactory { provider: ScriptedAi::new() }),
            reporter,
            &plan.plan_id,
            &all_ids(&plan),
            rx,
        )
        .await
        .unwrap();

        assert!(report.cancelled);
        assert_eq!(report.success_count, 1, "the first file finishes: {:?}", report.outcomes);
        let cancelled_count = report
            .outcomes
            .iter()
            .filter(|o| o.status == TranslationStatusDto::Cancelled)
            .count();
        assert_eq!(cancelled_count, 2, "the in-flight and unstarted files are both cancelled");
        assert_eq!(
            fs::read_dir(dir.path())
                .unwrap()
                .flatten()
                .filter(|entry| entry.file_name().to_string_lossy().contains(".zh-TW."))
                .count(),
            1,
            "no file after the cancel may be written"
        );
    }

    // @covers translate-workflow/batch-execution-with-per-file-progress-cancellation-and-per-item-report#ai-provider-not-configured
    #[tokio::test]
    async fn an_unconfigured_provider_points_at_settings() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("episode.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(TranslateState::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .unwrap();
        let error = execute_translation_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(UnconfiguredAiFactory),
            Arc::new(RecordingReporter::default()),
            &plan.plan_id,
            &all_ids(&plan),
        )
        .await
        .expect_err("an unconfigured provider must fail the batch");

        assert_eq!(error.code, CODE_AI_NOT_CONFIGURED);
        assert_eq!(error.hint_code.as_deref(), Some(HINT_AI_NOT_CONFIGURED));
    }

    // @covers translate-workflow/batch-execution-with-per-file-progress-cancellation-and-per-item-report#stale-plan-is-rejected
    #[tokio::test]
    async fn execution_rejects_a_stale_plan_and_releases_the_slot() {
        let state = Arc::new(TranslateState::default());

        let error = execute_translation_impl(
            service(),
            Arc::clone(&state),
            Arc::new(ScriptedAiFactory { provider: ScriptedAi::new() }),
            Arc::new(RecordingReporter::default()),
            "translate-does-not-exist",
            &[0],
        )
        .await
        .expect_err("an unknown plan must be rejected");

        assert_eq!(error.code, CODE_STALE_PLAN);
        assert_eq!(error.hint_code.as_deref(), Some(HINT_STALE_PLAN));
        assert!(!state.is_running().await, "a rejected batch must not hold the execution slot");
    }

    /// A second batch must not run alongside the first: they would race over
    /// the same output paths, and the loser would report successes it did not
    /// achieve.
    #[tokio::test]
    async fn a_second_batch_is_rejected_while_one_is_running() {
        let state = Arc::new(TranslateState::default());
        state.try_begin_execution().await.expect("the first batch reserves the slot");

        let error = execute_translation_impl(
            service(),
            Arc::clone(&state),
            Arc::new(ScriptedAiFactory { provider: ScriptedAi::new() }),
            Arc::new(RecordingReporter::default()),
            "translate-1",
            &[0],
        )
        .await
        .expect_err("a concurrent batch must be rejected");

        assert_eq!(error.code, CODE_TRANSLATION_IN_PROGRESS);
    }

    /// Selecting an excluded item by hand must not translate it: the plan's
    /// exclusions are a contract, not a UI convenience.
    #[tokio::test]
    async fn a_hand_selected_excluded_item_is_refused() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("movie.srt"), SRT).unwrap();
        // Valid SRT, not garbage: this file is itself scanned as a subtitle
        // source (its extension matches), so it must parse cleanly or it would
        // independently earn `translate.unparsable`.
        fs::write(dir.path().join("movie.zh-TW.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(TranslateState::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .unwrap();
        let excluded_id = item_named(&plan, "movie.srt").id;
        let report = execute_translation_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(ScriptedAiFactory { provider: ScriptedAi::new() }),
            Arc::new(RecordingReporter::default()),
            &plan.plan_id,
            &[excluded_id],
        )
        .await
        .unwrap();

        assert_eq!(report.outcomes.len(), 1);
        assert_eq!(report.outcomes[0].status, TranslationStatusDto::Skipped);
        assert_eq!(
            report.outcomes[0].error.as_ref().map(|e| e.code.as_str()),
            Some(CODE_OUTPUT_EXISTS)
        );
        assert_eq!(
            fs::read_to_string(dir.path().join("movie.zh-TW.srt")).unwrap(),
            SRT,
            "a skipped item must not be translated"
        );
    }

    /// The engine's empty-string fallback (a cue still missing after the
    /// missing-cue retry) must surface as a warning, not be silently accepted.
    #[tokio::test]
    async fn an_empty_cue_fallback_is_reported_as_a_warning() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("one.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(TranslateState::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .unwrap();
        let report = execute_translation_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(ScriptedAiFactory { provider: ScriptedAi::dropping_every_cue() }),
            Arc::new(RecordingReporter::default()),
            &plan.plan_id,
            &all_ids(&plan),
        )
        .await
        .unwrap();

        assert_eq!(report.success_count, 1, "{:?}", report.outcomes);
        assert_eq!(
            report.outcomes[0].warning.as_ref().map(|w| w.code.as_str()),
            Some(CODE_EMPTY_CUE_FALLBACK)
        );
    }

    // ─── Batch-level progress ───────────────────────────────────────────────

    // @covers translate-workflow/batch-level-progress-reporting#a-clean-file-reports-its-phases-in-order
    #[tokio::test]
    async fn a_clean_file_reports_its_phases_in_order() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("long.srt"), srt_with(250)).unwrap();

        let (report, progress) = run_recorded(
            service_with_batch_size(100),
            vec![dir.path().to_path_buf()],
            Arc::new(ScriptedAiFactory { provider: ScriptedAi::new() }),
            None,
        )
        .await;

        assert_eq!(report.success_count, 1, "{:?}", report.outcomes);
        use TranslateStage::*;
        // In-flight snapshots still carry the previous batch's processed count.
        let mut expected = vec![
            step(1, Terminology, 0, 0, 0),
            step(1, Translating, 1, 0, 0),
            step(1, Translating, 0, 1, 100),
            step(1, Translating, 2, 1, 100),
            step(1, Translating, 0, 2, 200),
            step(1, Translating, 3, 2, 200),
            step(1, Translating, 0, 3, 250),
        ];
        expected.push(step(1, Writing, 0, 3, 250));
        expected.push(Step {
            outcome: Some(TranslationStatusDto::Translated),
            ..step(1, FileDone, 0, 3, 250)
        });
        expected.push(step(1, Finished, 0, 0, 0));
        assert_eq!(steps(&progress), expected);
        assert!(progress[..progress.len() - 1].iter().all(|p| p.total_cues == 250
            && p.batch_size == 100
            && p.batch_total == 3));
    }

    // @covers translate-workflow/batch-level-progress-reporting#a-resent-batch-is-flagged
    #[tokio::test]
    async fn a_resent_batch_is_flagged_and_does_not_count_as_returned() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("one.srt"), srt_with(3)).unwrap();
        let provider: Arc<dyn AIProvider> = Arc::new(UnknownIdOnceAi { sent_bogus: Mutex::new(false) });

        let (report, progress) = run_recorded(
            service_with_batch_size(2),
            vec![dir.path().to_path_buf()],
            Arc::new(FixedFactory(provider)),
            None,
        )
        .await;

        assert_eq!(report.success_count, 1, "{:?}", report.outcomes);
        let batches: Vec<(u32, u32, bool)> = progress
            .iter()
            .filter(|p| p.stage == TranslateStage::Translating)
            .map(|p| (p.batch_in_flight, p.batches_done, p.resend))
            .collect();
        assert_eq!(
            batches,
            [(1, 0, false), (1, 0, true), (0, 1, false), (2, 1, false), (0, 2, false)],
            "batch 1 is resent once, and only its resend's return counts"
        );
    }

    // @covers translate-workflow/batch-level-progress-reporting#the-fill-in-pass-is-reported-as-its-own-phase
    #[tokio::test]
    async fn the_fill_in_pass_is_reported_as_its_own_phase() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("one.srt"), SRT).unwrap();

        let (_, progress) = run_recorded(
            service(),
            vec![dir.path().to_path_buf()],
            Arc::new(ScriptedAiFactory { provider: ScriptedAi::dropping_every_cue() }),
            None,
        )
        .await;

        let fill_in: Vec<&TranslateProgress> =
            progress.iter().filter(|p| p.stage == TranslateStage::FillIn).collect();
        assert!(!fill_in.is_empty(), "{progress:?}");
        for snapshot in &fill_in {
            assert_eq!(snapshot.batch_in_flight, 0);
            assert_eq!(snapshot.batches_done, snapshot.batch_total);
        }
        let last = fill_in.last().unwrap();
        assert_eq!(last.processed_cues, last.total_cues);
        assert_eq!(last.total_cues, 2);
    }

    // @covers translate-workflow/per-file-completion-reporting#a-failed-file-reports-completion-and-the-batch-continues
    #[tokio::test]
    async fn a_failed_file_reports_completion_and_the_batch_continues() {
        /// Fails every request of the file whose cue text carries the marker,
        /// its terminology request first.
        struct FailMarked;
        #[async_trait]
        impl AIProvider for FailMarked {
            async fn analyze_content(&self, _r: AnalysisRequest) -> subx_core::Result<MatchResult> {
                unimplemented!()
            }
            async fn verify_match(&self, _v: VerificationRequest) -> subx_core::Result<ConfidenceScore> {
                unimplemented!()
            }
            async fn chat_completion(&self, messages: Vec<serde_json::Value>) -> subx_core::Result<String> {
                let prompt = last_prompt(&messages);
                if prompt.contains("BREAKME") {
                    return Err(SubXError::ai_service("scripted failure"));
                }
                let ids = extract_ids(&prompt);
                if ids.is_empty() {
                    return Ok(r#"{"terms":[]}"#.to_string());
                }
                Ok(echo(&ids))
            }
        }

        let dir = TempDir::new().unwrap();
        // `a` sorts first, so the failing file is the first of the two.
        fs::write(dir.path().join("a.srt"), "1\n00:00:01,000 --> 00:00:02,000\nBREAKME\n\n").unwrap();
        fs::write(dir.path().join("b.srt"), SRT).unwrap();

        let (report, progress) = run_recorded(
            service(),
            vec![dir.path().join("a.srt"), dir.path().join("b.srt")],
            Arc::new(FixedFactory(Arc::new(FailMarked))),
            None,
        )
        .await;

        assert_eq!(report.failure_count, 1);
        let first_file: Vec<(TranslateStage, Option<TranslationStatusDto>)> = progress
            .iter()
            .filter(|p| p.index == 1)
            .map(|p| (p.stage.clone(), p.outcome.clone()))
            .collect();
        assert_eq!(
            first_file,
            [
                (TranslateStage::Terminology, None),
                (TranslateStage::FileDone, Some(TranslationStatusDto::Failed)),
            ]
        );
        let done = progress.iter().position(|p| p.index == 1 && p.stage == TranslateStage::FileDone).unwrap();
        assert_eq!(
            (progress[done + 1].index, progress[done + 1].stage.clone()),
            (2, TranslateStage::Terminology)
        );
    }

    // @covers translate-workflow/per-file-completion-reporting#cancellation-stops-progress
    #[tokio::test]
    async fn cancelling_while_a_batch_is_in_flight_stops_progress() {
        let dir = TempDir::new().unwrap();
        for name in ["one.srt", "two.srt", "three.srt"] {
            fs::write(dir.path().join(name), SRT).unwrap();
        }
        let paths: Vec<PathBuf> = ["one.srt", "two.srt", "three.srt"]
            .iter()
            .map(|name| dir.path().join(name))
            .collect();
        let service = service();
        let state = Arc::new(TranslateState::default());
        let plan = preview(
            &service,
            &state,
            paths,
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .unwrap();
        let (tx, rx) = watch::channel(false);
        let reporter = Arc::new(CancelOnSecondFileBatch { tx, seen: Mutex::new(Vec::new()) });
        let provider = Arc::new(YieldingAi { answered: Mutex::new(Vec::new()) });

        let report = run_batch(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(FixedFactory(provider.clone())),
            reporter.clone(),
            &plan.plan_id,
            &all_ids(&plan),
            rx,
        )
        .await
        .unwrap();

        assert!(report.cancelled);
        let progress = reporter.seen.lock().unwrap().clone();
        let cancel_at = progress
            .iter()
            .position(|p| p.index == 2 && p.batch_in_flight == 1)
            .expect("the second file's first batch must have gone in flight");
        let after: Vec<(u32, TranslateStage, Option<TranslationStatusDto>)> = progress[cancel_at + 1..]
            .iter()
            .map(|p| (p.index, p.stage.clone(), p.outcome.clone()))
            .collect();
        assert_eq!(
            after,
            [
                (2, TranslateStage::FileDone, Some(TranslationStatusDto::Cancelled)),
                (3, TranslateStage::FileDone, Some(TranslationStatusDto::Cancelled)),
                (3, TranslateStage::Finished, None),
            ]
        );
        // The in-flight request never answered: only file one's batch did.
        assert_eq!(provider.answered.lock().unwrap().len(), 1);
        assert!(dir.path().join("one.zh-TW.srt").exists());
        assert!(!dir.path().join("two.zh-TW.srt").exists());
        assert!(!dir.path().join("three.zh-TW.srt").exists());
    }

    #[tokio::test]
    async fn progress_names_files_by_plan_id_after_a_deselection() {
        let dir = TempDir::new().unwrap();
        for name in ["a.srt", "b.srt", "c.srt"] {
            fs::write(dir.path().join(name), SRT).unwrap();
        }
        let paths: Vec<PathBuf> = ["a.srt", "b.srt", "c.srt"].iter().map(|n| dir.path().join(n)).collect();

        let (report, progress) = run_recorded(
            service(),
            paths,
            Arc::new(ScriptedAiFactory { provider: ScriptedAi::new() }),
            Some(vec![1, 2]),
        )
        .await;

        assert_eq!(report.success_count, 2);
        let per_file: Vec<(u32, u32)> = progress
            .iter()
            .filter(|p| p.stage == TranslateStage::Terminology)
            .map(|p| (p.index, p.item_id))
            .collect();
        assert_eq!(per_file, [(1, 1), (2, 2)], "queue position 1 is plan item 1, not 0");
        assert!(progress
            .iter()
            .filter(|p| p.stage != TranslateStage::Finished)
            .all(|p| p.item_id == 1 || p.item_id == 2));
    }

    #[tokio::test]
    async fn a_hand_selected_excluded_item_reports_a_skipped_completion_only() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("movie.srt"), SRT).unwrap();
        fs::write(dir.path().join("movie.zh-TW.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(TranslateState::default());
        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some("zh-TW"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .unwrap();
        let excluded = item_named(&plan, "movie.srt").id;
        let reporter = Arc::new(RecordingReporter::default());

        execute_translation_impl(
            Arc::clone(&service),
            state,
            Arc::new(ScriptedAiFactory { provider: ScriptedAi::new() }),
            reporter.clone(),
            &plan.plan_id,
            &[excluded],
        )
        .await
        .unwrap();

        let stages: Vec<(TranslateStage, Option<TranslationStatusDto>, u32)> = reporter
            .seen()
            .iter()
            .map(|p| (p.stage.clone(), p.outcome.clone(), p.item_id))
            .collect();
        assert_eq!(
            stages,
            [
                (TranslateStage::FileDone, Some(TranslationStatusDto::Skipped), excluded),
                (TranslateStage::Finished, None, 0),
            ]
        );
    }

    #[test]
    fn engine_counts_saturate_instead_of_wrapping() {
        assert_eq!(narrow(7), 7);
        assert_eq!(narrow(u64::MAX), u32::MAX);
    }

    #[test]
    fn engine_events_outside_a_file_or_after_a_cancel_are_dropped() {
        let sink = Arc::new(RecordingReporter::default());
        let (tx, rx) = watch::channel(false);
        let tracker = Arc::new(ProgressTracker::new(sink.clone(), rx));
        let reporter = EngineProgressReporter(Arc::clone(&tracker));
        let started = ProgressEvent::Translation(TranslationProgress::BatchStarted {
            pass: TranslationPass::Initial,
            batch: 1,
            batches: 1,
            cues: 2,
            attempt: 1,
        });

        // No file in flight yet.
        reporter.progress(&started);
        // Text lines never reach the GUI.
        reporter.progress(&ProgressEvent::Message("Processed cues: 1/2"));
        assert!(sink.seen().is_empty());

        let item = TranslatePlanItem {
            id: 4,
            input: PathBuf::from("/m/a.srt"),
            output: PathBuf::from("/m/a.zh-TW.srt"),
            cue_count: 2,
            output_exists: false,
            skip_reason: None,
        };
        tracker.start_file(&FileStart { index: 1, total: 1, name: "a.srt".into(), item: &item, batch_size: 0 });
        tx.send(true).unwrap();
        reporter.progress(&started);
        tracker.writing();
        tracker.finish_file(TranslationStatusDto::Cancelled);

        let seen = sink.seen();
        assert_eq!(seen.len(), 2, "{seen:?}");
        assert_eq!(seen[0].stage, TranslateStage::Terminology);
        assert_eq!(seen[0].batch_total, 0, "a zero batch size must not divide by zero");
        assert_eq!(seen[1].stage, TranslateStage::FileDone);
        assert_eq!(seen[1].item_id, 4);
    }

    #[test]
    fn a_lock_free_translation_in_progress_error_carries_no_hint() {
        let error = translation_in_progress();
        assert_eq!(error.code, CODE_TRANSLATION_IN_PROGRESS);
        assert_eq!(error.hint_code, None);
    }

    #[test]
    fn backup_path_appends_before_the_extension() {
        assert_eq!(backup_path(Path::new("movie.srt")), PathBuf::from("movie.srt.backup"));
        assert_eq!(backup_path(Path::new("movie")), PathBuf::from("movie.backup"));
    }

    #[test]
    fn target_language_precedence_prefers_the_per_run_value() {
        assert_eq!(
            resolve_target_language(Some("ja"), Some("zh-TW")).unwrap(),
            "ja"
        );
        assert_eq!(resolve_target_language(None, Some("zh-TW")).unwrap(), "zh-TW");
        assert_eq!(resolve_target_language(Some("  "), Some("zh-TW")).unwrap(), "zh-TW");
        assert!(resolve_target_language(None, None).is_err());
    }

    /// A target language becomes one file-name component
    /// (`{stem}.{target_language}.{ext}`); a path separator inside it would
    /// let the resolved output escape the input's directory (rubber-duck
    /// review finding).
    #[tokio::test]
    async fn a_target_language_containing_a_path_separator_is_rejected() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("movie.srt"), SRT).unwrap();

        let error = preview(
            &service(),
            &Arc::new(TranslateState::default()),
            vec![dir.path().to_path_buf()],
            options(Some("../../elsewhere"), TranslateOutputModeDto::Suffix, false),
        )
        .await
        .expect_err("a path-shaped target language must be rejected");

        assert_eq!(error.code, CODE_INVALID_TARGET_LANGUAGE);
        assert_eq!(error.hint_code.as_deref(), Some(HINT_INVALID_TARGET_LANGUAGE));
    }

    #[test]
    fn path_like_languages_are_rejected_and_plain_ones_are_not() {
        assert!(reject_path_like_language("zh-TW").is_ok());
        assert!(reject_path_like_language("../../elsewhere").is_err());
        assert!(reject_path_like_language("a/b").is_err());
        assert!(reject_path_like_language("a\\b").is_err());
    }
}
