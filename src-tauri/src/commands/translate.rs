//! Translate wizard commands.
//!
//! The end-to-end GUI translation flow, wrapping the `subx-cli` crate's
//! `TranslationEngine`: scan sources, resolve every output path and glossary
//! entry up front, hold the plan canonically in backend state, and translate a
//! reviewed subset with per-file progress, mid-file cancellation, and per-item
//! reporting. Like every command module this is a thin translation layer — the
//! translation itself all lives in the crate.
//!
//! `TranslationEngine::translate_subtitle` is pure in-memory (no filesystem
//! I/O, no progress callback) and takes a target language, glossary and
//! context bundled into one `TranslationRequest`. The CLI's output-resolution
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
use std::sync::Arc;

use subx_cli::cli::{CollectedFiles, InputPathHandler};
use subx_cli::config::ConfigService;
use subx_cli::core::formats::manager::FormatManager;
use subx_cli::core::matcher::{FileDiscovery, MediaFileType};
use subx_cli::core::translation::{parse_glossary_text, TranslationEngine, TranslationRequest};
use subx_cli::core::ComponentFactory;
use subx_cli::error::SubXError;
use subx_cli::services::ai::AIProvider;
use tauri::ipc::Channel;
use tauri::State;
use tokio::sync::watch;

use crate::dto::{
    TranslateItemDto, TranslateOptionsDto, TranslateOutputModeDto, TranslatePlanDto,
    TranslateProgress, TranslateScanItemDto, TranslateScanResult, TranslateStage,
    TranslationOutcomeDto, TranslationReportDto, TranslationStatusDto,
};
use crate::error::ErrorDto;
use crate::paths::path_key;
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

    let selected: HashSet<usize> = item_ids.iter().map(|&id| id as usize).collect();
    let queue: Vec<TranslatePlanItem> = items
        .into_iter()
        .enumerate()
        .filter(|(index, _)| selected.contains(index))
        .map(|(_, item)| item)
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
            let engine =
                TranslationEngine::new(provider, batch_size).map_err(ErrorDto::from)?;
            let total = queue.len() as u32;
            let mut outcomes = Vec::with_capacity(queue.len());
            let mut cancelled = false;

            for (position, item) in queue.iter().enumerate() {
                let name = display_name(&item.input);

                // Checked before each item, and again below mid-item: unlike
                // convert's between-files-only cancel, translation is
                // interrupted while a file is in flight too (design D3).
                if cancelled || *cancel_rx.borrow() {
                    cancelled = true;
                    outcomes.push(cancelled_outcome(item, &name));
                    continue;
                }

                // The UI cannot select an excluded item; refusing it here
                // means a hand-built `item_ids` cannot translate one either.
                if let Some(reason) = &item.skip_reason {
                    let mut skipped = blank_outcome(item, &name, TranslationStatusDto::Skipped);
                    skipped.error =
                        Some(ErrorDto::new(reason.clone(), "the item is excluded from the plan"));
                    outcomes.push(skipped);
                    continue;
                }

                reporter.report(TranslateProgress {
                    stage: TranslateStage::Translating,
                    index: position as u32 + 1,
                    total,
                    file_name: name.clone(),
                });

                // Races the whole per-file translation (load, AI round-trips,
                // write) against the cancel signal. Dropping the losing
                // `translate_one` branch cancels its pending HTTP request;
                // because a write only happens after full success, the
                // abandoned file simply has no output (design D2, D3).
                let raced = tokio::select! {
                    biased;
                    _ = cancel_rx.changed() => None,
                    outcome = translate_one(&engine, &request, item, replace_mode, backup_enabled) => Some(outcome),
                };

                match raced {
                    None => {
                        cancelled = true;
                        outcomes.push(cancelled_outcome(item, &name));
                    }
                    Some(outcome) => outcomes.push(outcome),
                }
            }

            reporter.report(TranslateProgress {
                stage: TranslateStage::Finished,
                index: total,
                total,
                file_name: String::new(),
            });

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

/// The subtitle files among the collected inputs, in scan order.
fn subtitle_files(collected: &CollectedFiles) -> Result<Vec<PathBuf>, ErrorDto> {
    let file_paths: &[PathBuf] = collected;
    let media = FileDiscovery::new()
        .scan_file_list(file_paths)
        .map_err(ErrorDto::from)?;

    Ok(media
        .into_iter()
        .filter(|file| matches!(file.file_type, MediaFileType::Subtitle))
        .map(|file| file.path)
        .collect())
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
            .enumerate()
            .map(|(index, item)| TranslateItemDto {
                id: index as u32,
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
    use subx_cli::config::{TestConfigBuilder, TestConfigService};
    use subx_cli::services::ai::{AnalysisRequest, ConfidenceScore, MatchResult, VerificationRequest};
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
        async fn analyze_content(&self, _r: AnalysisRequest) -> subx_cli::Result<MatchResult> {
            unimplemented!("the translate flow never matches")
        }

        async fn verify_match(&self, _v: VerificationRequest) -> subx_cli::Result<ConfidenceScore> {
            unimplemented!("the translate flow never verifies")
        }

        async fn chat_completion(&self, messages: Vec<serde_json::Value>) -> subx_cli::Result<String> {
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

    /// Sends on its own `watch::Sender` as soon as the second file's progress
    /// is reported — synchronously, before that file's translation begins, so
    /// there is no scheduling race with the batch's own single-threaded
    /// worker (unlike routing through `TranslateState::cancel`, which needs an
    /// async lock and would race the loop instead of deterministically landing
    /// mid-file, per design D3's stronger guarantee).
    struct CancelOnSecondFile {
        tx: watch::Sender<bool>,
        seen: Mutex<u32>,
    }
    impl TranslateReporter for CancelOnSecondFile {
        fn report(&self, progress: TranslateProgress) {
            let mut seen = self.seen.lock().unwrap();
            *seen += 1;
            if *seen == 2 && progress.stage == TranslateStage::Translating {
                let _ = self.tx.send(true);
            }
        }
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
        preview_translation_impl(service.as_ref(), Arc::clone(state), paths, options).await
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
        let translating: Vec<&TranslateProgress> = progress
            .iter()
            .filter(|entry| entry.stage == TranslateStage::Translating)
            .collect();
        assert_eq!(translating.len(), 2);
        assert_eq!((translating[0].index, translating[0].total), (1, 2));
        assert_eq!((translating[1].index, translating[1].total), (2, 2));
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
            async fn analyze_content(&self, _r: AnalysisRequest) -> subx_cli::Result<MatchResult> {
                unimplemented!()
            }
            async fn verify_match(&self, _v: VerificationRequest) -> subx_cli::Result<ConfidenceScore> {
                unimplemented!()
            }
            async fn chat_completion(&self, messages: Vec<serde_json::Value>) -> subx_cli::Result<String> {
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
        let reporter = Arc::new(CancelOnSecondFile { tx, seen: Mutex::new(0) });

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
