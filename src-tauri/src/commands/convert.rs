//! Convert wizard commands.
//!
//! The end-to-end GUI conversion flow, wrapping the `subx-cli` crate's
//! `FormatConverter`: scan sources, resolve every output path up front, hold the
//! plan canonically in backend state, and convert a reviewed subset with
//! per-file progress and per-item reporting. Like every command module this is a
//! thin translation layer — the conversion itself all lives in the crate.
//!
//! Two crate behaviours shape the code below and are cited where they bite:
//! `convert_file` writes its output *before* validating it (so the executor
//! writes to a temporary sibling and renames only on success), and the
//! converter's `target_encoding` is a no-op that always produces UTF-8 (so no
//! encoding control is offered).
//!
//! [`ConversionReporter`] abstracts the progress sink, the same seam
//! `commands::r#match` uses, so the batch logic runs in tests without a channel.

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use subx_cli::cli::{CollectedFiles, InputPathHandler};
use subx_cli::config::ConfigService;
use subx_cli::core::file_manager::FileManager;
use subx_cli::core::formats::converter::{ConversionConfig, ConversionResult, FormatConverter};
use subx_cli::core::matcher::{FileDiscovery, MediaFileType};
use subx_cli::error::SubXError;
use tauri::ipc::Channel;
use tauri::State;

use crate::dto::{
    ConversionOutcomeDto, ConversionReportDto, ConversionStatusDto, ConvertFormatDto,
    ConvertItemDto, ConvertOptionsDto, ConvertPlanDto, ConvertProgress, ConvertScanResult,
    ConvertStage,
};
use crate::error::ErrorDto;
use crate::paths::path_key;
use crate::state::{AppState, ConvertPlan, ConvertPlanItem, ConvertState};

// Stable error codes the frontend localizes (design D7). Kept as literals so
// `backendCodeParity.test.ts` can find them and demand `en`/`zh-TW` strings.
const CODE_NO_SUBTITLES: &str = "convert.no_subtitles";
const CODE_STALE_PLAN: &str = "convert.stale_plan";
const CODE_CONVERSION_IN_PROGRESS: &str = "convert.conversion_in_progress";
const CODE_ALREADY_TARGET_FORMAT: &str = "convert.already_target_format";
const CODE_OUTPUT_COLLISION: &str = "convert.output_collision";

const HINT_NO_SUBTITLES: &str = "convert.no_subtitles.hint";
const HINT_STALE_PLAN: &str = "convert.stale_plan.hint";

// ─── Command wrappers ───────────────────────────────────────────────────────
// Two lines each: translate DTOs, supply the production seams, delegate.

/// Scans the given sources and returns the subtitle count for the Step 1
/// preview. An empty count is a valid result the UI blocks on, not an error.
#[tauri::command]
#[specta::specta]
pub async fn list_convert_inputs(paths: Vec<String>) -> Result<ConvertScanResult, ErrorDto> {
    scan_convert_inputs(&to_paths(&paths))
}

/// Resolves every output path for the chosen options and stores the resulting
/// plan, returning it for review in Step 2.
#[tauri::command]
#[specta::specta]
pub async fn preview_conversion(
    paths: Vec<String>,
    options: ConvertOptionsDto,
    state: State<'_, AppState>,
) -> Result<ConvertPlanDto, ErrorDto> {
    preview_conversion_impl(
        state.config_service(),
        state.convert_state(),
        to_paths(&paths),
        options,
    )
    .await
}

/// Converts exactly the selected items of a plan, reporting per-file progress
/// over `on_progress`, and returns each item's outcome.
#[tauri::command]
#[specta::specta]
pub async fn execute_conversion(
    plan_id: String,
    item_ids: Vec<u32>,
    on_progress: Channel<ConvertProgress>,
    state: State<'_, AppState>,
) -> Result<ConversionReportDto, ErrorDto> {
    execute_conversion_impl(
        state.config_service_arc(),
        state.convert_state(),
        Arc::new(ChannelReporter::new(on_progress)),
        &plan_id,
        &item_ids,
    )
    .await
}

/// Stops a running batch before its next file and discards the pending plan.
#[tauri::command]
#[specta::specta]
pub async fn cancel_conversion(state: State<'_, AppState>) -> Result<(), ErrorDto> {
    state.convert_state().cancel().await;
    Ok(())
}

// ─── Seams ──────────────────────────────────────────────────────────────────

/// Reports batch progress. Injected so the logic runs without an `AppHandle`.
pub trait ConversionReporter: Send + Sync {
    fn report(&self, progress: ConvertProgress);
}

/// The production reporter: pushes progress over the invocation's `Channel`.
struct ChannelReporter {
    channel: Channel<ConvertProgress>,
}

impl ChannelReporter {
    fn new(channel: Channel<ConvertProgress>) -> Self {
        Self { channel }
    }
}

impl ConversionReporter for ChannelReporter {
    fn report(&self, progress: ConvertProgress) {
        // Progress is best-effort: a failed send must not fail the batch.
        let _ = self.channel.send(progress);
    }
}

// ─── Implementations ────────────────────────────────────────────────────────

/// Counts the convertible subtitle files across the sources.
fn scan_convert_inputs(paths: &[PathBuf]) -> Result<ConvertScanResult, ErrorDto> {
    let collected = collect_input_files(paths)?;
    Ok(ConvertScanResult {
        subtitle_count: subtitle_files(&collected)?.len() as u32,
    })
}

/// Builds and stores the conversion plan for one set of options.
///
/// Everything the user is about to authorize is decided here: which files run,
/// where each one lands, and which of them conflict. Execution then performs
/// exactly this plan and decides nothing further.
async fn preview_conversion_impl(
    service: &dyn ConfigService,
    convert_state: Arc<ConvertState>,
    paths: Vec<PathBuf>,
    options: ConvertOptionsDto,
) -> Result<ConvertPlanDto, ErrorDto> {
    // Pin the epoch before doing any work: a cancel while the sources are being
    // collected must discard this plan rather than install it behind the user.
    let epoch = convert_state.current_epoch().await;

    let target_format = match options.target_format {
        Some(format) => format,
        None => configured_default_format(service)?,
    };
    let format_id = format_id(target_format);

    let collected = collect_input_files(&paths)?;
    let inputs = subtitle_files(&collected)?;
    if inputs.is_empty() {
        return Err(no_subtitles());
    }

    // Output paths already claimed by an earlier item. Two inputs can resolve to
    // one output (`a.srt` and `a.ass` both become `a.vtt`), and converting both
    // would silently last-write-win while reporting two successes.
    let mut claimed: HashSet<String> = HashSet::new();
    let mut items = Vec::with_capacity(inputs.len());
    for input in inputs {
        let output = resolve_output_path(&input, &collected, format_id);

        // Design D2: the skip test is the path comparison itself, and it runs
        // first — a same-format item's "output" trivially exists, and flagging
        // it as an overwrite too would show a contradictory state.
        let skip_reason = if path_key(&output) == path_key(&input) {
            Some(CODE_ALREADY_TARGET_FORMAT.to_string())
        } else if !claimed.insert(path_key(&output)) {
            Some(CODE_OUTPUT_COLLISION.to_string())
        } else {
            None
        };
        // Only a runnable item can overwrite anything, so an excluded one
        // carries its exclusion reason and nothing else.
        let output_exists = skip_reason.is_none() && output.exists();

        items.push(ConvertPlanItem {
            input,
            output,
            output_exists,
            skip_reason,
        });
    }

    let plan = ConvertPlan::new(
        format_id.to_string(),
        options.keep_original,
        items,
        collected,
    );
    let dto = build_plan_dto(&plan, target_format);

    if convert_state.commit_plan(epoch, plan).await {
        Ok(dto)
    } else {
        // A cancel landed while we were resolving; the user is back on Step 1.
        Err(stale_plan())
    }
}

/// Runs one batch, guarding the single execution slot around it.
///
/// The slot is reserved before anything is read or written, so a second caller
/// converts nothing at all rather than racing this one over the same outputs.
async fn execute_conversion_impl(
    service: Arc<dyn ConfigService>,
    convert_state: Arc<ConvertState>,
    reporter: Arc<dyn ConversionReporter>,
    plan_id: &str,
    item_ids: &[u32],
) -> Result<ConversionReportDto, ErrorDto> {
    let cancel = convert_state
        .try_begin_execution()
        .await
        .map_err(|()| conversion_in_progress())?;

    // Not `?`: the slot must be released on every path out of the batch,
    // including the stale-plan rejection below.
    let report = run_batch(
        service,
        Arc::clone(&convert_state),
        reporter,
        plan_id,
        item_ids,
        cancel,
    )
    .await;
    convert_state.finish_execution().await;
    report
}

/// The batch body: consume the plan, convert each selected item, report.
async fn run_batch(
    service: Arc<dyn ConfigService>,
    convert_state: Arc<ConvertState>,
    reporter: Arc<dyn ConversionReporter>,
    plan_id: &str,
    item_ids: &[u32],
    cancel: Arc<AtomicBool>,
) -> Result<ConversionReportDto, ErrorDto> {
    // A plan is converted once; consuming it here drops its `CollectedFiles`
    // when we return, which is what deletes the archive-extraction temp dirs.
    let plan = convert_state.take_plan_if(plan_id).await.ok_or_else(stale_plan)?;
    let format_id = plan.target_format().to_string();
    let keep_original = plan.keep_original();
    // `_collected` owns the archive-extraction temp dirs; it MUST stay in scope
    // across every conversion `.await`, or an archive-sourced input is deleted
    // before it is read.
    let (items, _collected) = plan.into_execution();

    // Reload first: `preserve_styling` may have been changed on the Settings
    // screen since this process last read the file.
    service.reload().map_err(ErrorDto::from)?;
    let config = service.get_config().map_err(ErrorDto::from)?;
    let conversion = ConversionConfig {
        preserve_styling: config.formats.preserve_styling,
        // Declared truthfully even though the crate ignores it and always
        // writes UTF-8; that is why the wizard offers no encoding control.
        target_encoding: "utf-8".to_string(),
        // The converter never deletes anything — removal is this module's job
        // (design D4) — but the config field is filled in to match the run.
        keep_original,
        validate_output: true,
    };

    let selected: HashSet<usize> = item_ids.iter().map(|&id| id as usize).collect();
    let queue: Vec<&ConvertPlanItem> = items
        .iter()
        .enumerate()
        .filter(|(index, _)| selected.contains(index))
        .map(|(_, item)| item)
        .collect();
    let total = queue.len() as u32;

    let mut manager = FileManager::new();
    let mut outcomes = Vec::with_capacity(queue.len());
    let mut cancelled = false;

    for (position, item) in queue.iter().enumerate() {
        let name = display_name(&item.input);

        // Checked *between* files, never inside one: an aborted write is the
        // only way this flow could leave a corrupt file behind (design D5).
        if cancelled || cancel.load(Ordering::SeqCst) {
            cancelled = true;
            outcomes.push(outcome(item, &name, ConversionStatusDto::Cancelled));
            continue;
        }

        // The UI cannot select an excluded item; refusing it here means a
        // hand-built `item_ids` cannot convert one either.
        if let Some(reason) = &item.skip_reason {
            let mut skipped = outcome(item, &name, ConversionStatusDto::Skipped);
            skipped.error = Some(ErrorDto::new(reason.clone(), "the item is excluded from the plan"));
            outcomes.push(skipped);
            continue;
        }

        reporter.report(ConvertProgress {
            stage: ConvertStage::Converting,
            index: position as u32 + 1,
            total,
            file_name: name.clone(),
        });
        outcomes.push(
            convert_one(&conversion, &mut manager, item, &format_id, keep_original, &name).await,
        );
    }

    reporter.report(ConvertProgress {
        stage: ConvertStage::Finished,
        index: total,
        total,
        file_name: String::new(),
    });

    Ok(build_report(outcomes, cancelled))
}

/// Converts one file, then removes its input if the run asked for that.
///
/// The conversion writes to a temporary sibling and is renamed over the real
/// output only once the crate reports success: `convert_file` writes before it
/// validates, so a direct write would have already replaced an existing output
/// by the time it tells us the conversion failed (design D3).
async fn convert_one(
    conversion: &ConversionConfig,
    manager: &mut FileManager,
    item: &ConvertPlanItem,
    format_id: &str,
    keep_original: bool,
    name: &str,
) -> ConversionOutcomeDto {
    // Read now rather than trusting the preview-time flag: the report describes
    // what this run actually did to the filesystem it found.
    let overwritten = item.output.exists();
    let temp = temp_output_path(&item.output);

    let converted = convert_off_thread(
        conversion.clone(),
        item.input.clone(),
        temp.clone(),
        format_id.to_string(),
    )
    .await;
    let written = match converted {
        Ok(result) if result.success => std::fs::rename(&temp, &item.output)
            .map_err(|err| ErrorDto::from(SubXError::FileOperationFailed(err.to_string()))),
        Ok(result) => Err(conversion_rejected(&result)),
        Err(err) => Err(err),
    };

    let mut record = outcome(item, name, ConversionStatusDto::Converted);
    match written {
        Ok(()) => {
            record.overwritten = overwritten;
            if !keep_original {
                // Only after success, and never silently: the CLI discards this
                // `Result`, which would let the report claim a conversion the
                // user's directory does not reflect (design D4).
                match manager.remove_file(&item.input) {
                    Ok(()) => record.original_removed = true,
                    Err(err) => record.warning = Some(ErrorDto::from(err)),
                }
            }
        }
        Err(error) => {
            // Discard the half-written temporary; whatever was at the output
            // path keeps its original content.
            let _ = std::fs::remove_file(&temp);
            record.status = ConversionStatusDto::Failed;
            record.error = Some(error);
        }
    }
    record
}

/// Converts one file on a blocking worker that owns the converter outright.
///
/// `FormatConverter` holds boxed format handlers that are neither `Send` nor
/// `Sync`, so keeping one alive across an `.await` would make this command's
/// future non-`Send` — and Tauri requires async commands to be `Send`. (The CLI
/// never meets this constraint: its root future is driven by `block_on`, which
/// has no such bound.) Building the converter *inside* the worker keeps it off
/// the command's future entirely, and the worker gets its own current-thread
/// runtime because the crate converts with `tokio::fs`.
async fn convert_off_thread(
    conversion: ConversionConfig,
    input: PathBuf,
    output: PathBuf,
    format_id: String,
) -> Result<ConversionResult, ErrorDto> {
    tokio::task::spawn_blocking(move || {
        let runtime = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|err| ErrorDto::from(SubXError::CommandExecution(err.to_string())))?;
        runtime.block_on(async {
            FormatConverter::new(conversion)
                .convert_file(&input, &output, &format_id)
                .await
                .map_err(ErrorDto::from)
        })
    })
    .await
    .map_err(|err| ErrorDto::new("core.other", format!("the conversion worker failed: {err}")))?
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

fn to_paths(paths: &[String]) -> Vec<PathBuf> {
    paths.iter().map(PathBuf::from).collect()
}

/// The crate's identifier for a target format, as `convert_file` expects it.
fn format_id(format: ConvertFormatDto) -> &'static str {
    match format {
        ConvertFormatDto::Srt => "srt",
        ConvertFormatDto::Ass => "ass",
        ConvertFormatDto::Vtt => "vtt",
        ConvertFormatDto::Sub => "sub",
    }
}

/// The reverse mapping, for reading `formats.default_output` out of the config.
fn parse_format(id: &str) -> Option<ConvertFormatDto> {
    match id {
        "srt" => Some(ConvertFormatDto::Srt),
        "ass" => Some(ConvertFormatDto::Ass),
        "vtt" => Some(ConvertFormatDto::Vtt),
        "sub" => Some(ConvertFormatDto::Sub),
        _ => None,
    }
}

/// The configured default target format (design D6).
fn configured_default_format(service: &dyn ConfigService) -> Result<ConvertFormatDto, ErrorDto> {
    // The user may have changed it on the Settings screen since the last read.
    service.reload().map_err(ErrorDto::from)?;
    let config = service.get_config().map_err(ErrorDto::from)?;
    parse_format(&config.formats.default_output).ok_or_else(|| {
        ErrorDto::from(SubXError::config(format!(
            "Unknown default output format: {}",
            config.formats.default_output
        )))
    })
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

/// Where one input's conversion will be written.
///
/// Mirrors `convert_command.rs`, which computes this inline rather than
/// exposing it: outputs land beside the input, except for archive-extracted
/// files, which land beside the archive rather than inside the extraction
/// directory the user never chose (design Context #1).
fn resolve_output_path(input: &Path, collected: &CollectedFiles, format_id: &str) -> PathBuf {
    match collected.archive_origin(input) {
        Some(archive) => {
            let directory = archive.parent().unwrap_or_else(|| Path::new("."));
            let stem = input
                .file_stem()
                .and_then(|stem| stem.to_str())
                .unwrap_or("output");
            directory.join(format!("{stem}.{format_id}"))
        }
        None => input.with_extension(format_id),
    }
}

/// The sibling path a conversion is written to before it is known to be good.
///
/// A sibling, not a temp directory: the rename that publishes it is only atomic
/// within one filesystem, and `output`'s own directory is the one place
/// guaranteed to be on the same one. The `.subx-convert` suffix also keeps a
/// temp file out of any plan: `subtitle_files` only ever returns paths the
/// crate classifies as subtitles by extension, so no item's input can be
/// another item's scratch path.
fn temp_output_path(output: &Path) -> PathBuf {
    let name = output
        .file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| "output".to_string());
    output.with_file_name(format!(".{name}.subx-convert"))
}

fn display_name(path: &Path) -> String {
    path.file_name()
        .map(|name| name.to_string_lossy().to_string())
        .unwrap_or_else(|| path.display().to_string())
}

/// A blank outcome for one item, filled in by the caller.
fn outcome(item: &ConvertPlanItem, name: &str, status: ConversionStatusDto) -> ConversionOutcomeDto {
    ConversionOutcomeDto {
        input_name: name.to_string(),
        output_path: item.output.display().to_string(),
        status,
        overwritten: false,
        original_removed: false,
        error: None,
        warning: None,
    }
}

fn build_plan_dto(plan: &ConvertPlan, target_format: ConvertFormatDto) -> ConvertPlanDto {
    ConvertPlanDto {
        plan_id: plan.id().to_string(),
        target_format,
        keep_original: plan.keep_original(),
        items: plan
            .items()
            .iter()
            .enumerate()
            .map(|(index, item)| ConvertItemDto {
                id: index as u32,
                input_name: display_name(&item.input),
                input_path: item.input.display().to_string(),
                output_path: item.output.display().to_string(),
                output_exists: item.output_exists,
                skip_reason: item.skip_reason.clone(),
            })
            .collect(),
    }
}

fn build_report(outcomes: Vec<ConversionOutcomeDto>, cancelled: bool) -> ConversionReportDto {
    let success_count = outcomes
        .iter()
        .filter(|outcome| outcome.status == ConversionStatusDto::Converted)
        .count() as u32;
    let failure_count = outcomes
        .iter()
        .filter(|outcome| outcome.status == ConversionStatusDto::Failed)
        .count() as u32;

    ConversionReportDto {
        outcomes,
        success_count,
        failure_count,
        cancelled,
    }
}

// ─── Error mapping ──────────────────────────────────────────────────────────

/// The converter ran but rejected its own output (validation failed).
///
/// Mirrors the CLI's synthetic mapping of the same case onto the subtitle-format
/// category, so it localizes through the shared `core.*` codes.
fn conversion_rejected(result: &ConversionResult) -> ErrorDto {
    let message = if result.errors.is_empty() {
        "Conversion produced an unsuccessful result".to_string()
    } else {
        result.errors.join("; ")
    };
    ErrorDto::new("core.subtitle_format", message)
}

fn no_subtitles() -> ErrorDto {
    ErrorDto::new(CODE_NO_SUBTITLES, "the sources hold no convertible subtitles")
        .with_hint(HINT_NO_SUBTITLES)
}

fn stale_plan() -> ErrorDto {
    ErrorDto::new(CODE_STALE_PLAN, "the plan was replaced by a newer preview")
        .with_hint(HINT_STALE_PLAN)
}

fn conversion_in_progress() -> ErrorDto {
    ErrorDto::new(CODE_CONVERSION_IN_PROGRESS, "a conversion is already running")
}

#[cfg(test)]
mod tests {
    use std::fs;
    use std::io::Write;
    use std::sync::Mutex;

    use subx_cli::config::TestConfigService;
    use tempfile::TempDir;

    use super::*;

    const SRT: &str = "1\n00:00:01,000 --> 00:00:02,000\nhello\n\n";

    // ─── Test doubles and builders ──────────────────────────────────────────

    fn service() -> Arc<dyn ConfigService> {
        Arc::new(TestConfigService::with_defaults())
    }

    fn options(format: Option<ConvertFormatDto>, keep_original: bool) -> ConvertOptionsDto {
        ConvertOptionsDto {
            target_format: format,
            keep_original,
        }
    }

    #[derive(Default)]
    struct RecordingReporter {
        seen: Mutex<Vec<ConvertProgress>>,
    }

    impl ConversionReporter for RecordingReporter {
        fn report(&self, progress: ConvertProgress) {
            self.seen.lock().unwrap().push(progress);
        }
    }

    impl RecordingReporter {
        fn seen(&self) -> Vec<ConvertProgress> {
            self.seen.lock().unwrap().clone()
        }
    }

    /// Raises the stop flag as the first file *starts*.
    ///
    /// The flag is only read between files, so this cancels while file 1 is
    /// mid-conversion: file 1 must still complete and file 2 must never begin,
    /// which is exactly the guarantee design D5 makes and a wall-clock race
    /// against a real user's click could not assert deterministically.
    struct CancelDuringFirstFile {
        flag: Arc<AtomicBool>,
    }

    impl ConversionReporter for CancelDuringFirstFile {
        fn report(&self, progress: ConvertProgress) {
            if progress.stage == ConvertStage::Converting {
                self.flag.store(true, Ordering::SeqCst);
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
        state: &Arc<ConvertState>,
        paths: Vec<PathBuf>,
        options: ConvertOptionsDto,
    ) -> Result<ConvertPlanDto, ErrorDto> {
        preview_conversion_impl(service.as_ref(), Arc::clone(state), paths, options).await
    }

    /// Every item's id, i.e. "convert everything the plan offers".
    fn all_ids(plan: &ConvertPlanDto) -> Vec<u32> {
        plan.items.iter().map(|item| item.id).collect()
    }

    fn item_named<'a>(plan: &'a ConvertPlanDto, name: &str) -> &'a ConvertItemDto {
        plan.items
            .iter()
            .find(|item| item.input_name == name)
            .unwrap_or_else(|| panic!("the plan must contain {name}: {:?}", plan.items))
    }

    // ─── Scan ───────────────────────────────────────────────────────────────

    // @covers convert-workflow/multi-source-selection-with-scan-preview#mixed-sources-are-scanned
    #[test]
    fn scan_counts_a_folder_a_loose_file_and_an_archive() {
        let dir = TempDir::new().unwrap();
        let folder = dir.path().join("media");
        fs::create_dir(&folder).unwrap();
        fs::write(folder.join("episode.srt"), SRT).unwrap();
        // A video in the same folder must not be counted as convertible.
        fs::write(folder.join("episode.mkv"), b"video").unwrap();
        let loose = dir.path().join("loose.srt");
        fs::write(&loose, SRT).unwrap();
        let archive = dir.path().join("bundle.zip");
        write_zip(&archive, &[("archived.srt", SRT)]);

        let result = scan_convert_inputs(&[folder, loose, archive]).unwrap();

        assert_eq!(result.subtitle_count, 3);
    }

    // ─── Preview ────────────────────────────────────────────────────────────

    // @covers convert-workflow/multi-source-selection-with-scan-preview#no-convertible-subtitles-block-progress
    #[tokio::test]
    async fn a_scan_without_subtitles_is_rejected() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("episode.mkv"), b"video").unwrap();

        let error = preview(
            &service(),
            &Arc::new(ConvertState::default()),
            vec![dir.path().to_path_buf()],
            options(Some(ConvertFormatDto::Srt), true),
        )
        .await
        .expect_err("a scan with no subtitles must be rejected");

        assert_eq!(error.code, CODE_NO_SUBTITLES);
        assert_eq!(error.hint_code.as_deref(), Some(HINT_NO_SUBTITLES));
    }

    // @covers convert-workflow/conversion-options-with-exact-output-path-preview#target-format-defaults-from-configuration
    #[tokio::test]
    async fn an_absent_target_format_resolves_from_the_configuration() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("episode.srt"), SRT).unwrap();
        let service = TestConfigService::with_defaults();
        service
            .set_config_value("formats.default_output", "vtt")
            .expect("the default output format must be settable");
        let service: Arc<dyn ConfigService> = Arc::new(service);

        let plan = preview(
            &service,
            &Arc::new(ConvertState::default()),
            vec![dir.path().to_path_buf()],
            options(None, true),
        )
        .await
        .expect("the preview must succeed");

        assert_eq!(plan.target_format, ConvertFormatDto::Vtt);
        assert!(
            plan.items[0].output_path.ends_with("episode.vtt"),
            "the configured default must drive the paths too: {:?}",
            plan.items[0]
        );
    }

    // @covers convert-workflow/conversion-options-with-exact-output-path-preview#archive-extracted-input-resolves-beside-the-archive
    #[tokio::test]
    async fn an_archive_extracted_input_is_written_beside_the_archive() {
        let dir = TempDir::new().unwrap();
        let archive = dir.path().join("season1.zip");
        write_zip(&archive, &[("episode.srt", SRT)]);

        let plan = preview(
            &service(),
            &Arc::new(ConvertState::default()),
            vec![archive],
            options(Some(ConvertFormatDto::Vtt), true),
        )
        .await
        .expect("the preview must succeed");

        assert_eq!(
            PathBuf::from(&plan.items[0].output_path),
            dir.path().join("episode.vtt"),
            "an extracted file's output must not stay in the extraction directory"
        );
    }

    // @covers convert-workflow/conversion-options-with-exact-output-path-preview#existing-output-is-flagged
    #[tokio::test]
    async fn an_existing_output_is_flagged_as_an_overwrite() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("episode.srt"), SRT).unwrap();
        fs::write(dir.path().join("episode.vtt"), "WEBVTT\n").unwrap();

        let plan = preview(
            &service(),
            &Arc::new(ConvertState::default()),
            vec![dir.path().to_path_buf()],
            options(Some(ConvertFormatDto::Vtt), true),
        )
        .await
        .expect("the preview must succeed");

        let item = item_named(&plan, "episode.srt");
        assert!(item.output_exists, "the existing output must be flagged");
        assert_eq!(item.skip_reason, None, "an overwrite is allowed, not skipped");
    }

    // @covers convert-workflow/conversion-options-with-exact-output-path-preview#input-already-in-the-target-format-is-auto-excluded
    #[tokio::test]
    async fn an_input_already_in_the_target_format_is_excluded_without_an_overwrite_flag() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("episode.srt"), SRT).unwrap();

        let plan = preview(
            &service(),
            &Arc::new(ConvertState::default()),
            vec![dir.path().to_path_buf()],
            options(Some(ConvertFormatDto::Srt), true),
        )
        .await
        .expect("the preview must succeed");

        let item = item_named(&plan, "episode.srt");
        assert_eq!(item.skip_reason.as_deref(), Some(CODE_ALREADY_TARGET_FORMAT));
        assert!(
            !item.output_exists,
            "a skipped item must not also read as an overwrite: {item:?}"
        );
    }

    // @covers convert-workflow/conversion-options-with-exact-output-path-preview#colliding-output-paths-are-excluded
    #[tokio::test]
    async fn only_the_first_of_two_inputs_sharing_an_output_is_executable() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("episode.srt"), SRT).unwrap();
        fs::write(dir.path().join("episode.ass"), SRT).unwrap();

        let plan = preview(
            &service(),
            &Arc::new(ConvertState::default()),
            vec![dir.path().to_path_buf()],
            options(Some(ConvertFormatDto::Vtt), true),
        )
        .await
        .expect("the preview must succeed");

        let runnable: Vec<&ConvertItemDto> = plan
            .items
            .iter()
            .filter(|item| item.skip_reason.is_none())
            .collect();
        assert_eq!(runnable.len(), 1, "one output path, one runnable item");
        let excluded: Vec<&ConvertItemDto> = plan
            .items
            .iter()
            .filter(|item| item.skip_reason.as_deref() == Some(CODE_OUTPUT_COLLISION))
            .collect();
        assert_eq!(excluded.len(), 1);
        assert_eq!(excluded[0].output_path, runnable[0].output_path);
    }

    // ─── Execution ──────────────────────────────────────────────────────────

    // @covers convert-workflow/batch-execution-with-progress-cancellation-and-per-item-report#per-file-progress-is-reported
    #[tokio::test]
    async fn a_batch_converts_every_selected_file_and_reports_each_one() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("one.srt"), SRT).unwrap();
        fs::write(dir.path().join("two.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(ConvertState::default());
        let reporter = Arc::new(RecordingReporter::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some(ConvertFormatDto::Vtt), true),
        )
        .await
        .unwrap();
        let report = execute_conversion_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            reporter.clone(),
            &plan.plan_id,
            &all_ids(&plan),
        )
        .await
        .expect("the batch must run");

        assert_eq!(report.success_count, 2);
        assert_eq!(report.failure_count, 0);
        assert!(!report.cancelled);
        assert!(dir.path().join("one.vtt").exists());
        assert!(dir.path().join("two.vtt").exists());
        // Keep-original is on, so both inputs survive.
        assert!(dir.path().join("one.srt").exists());
        assert!(
            fs::read_to_string(dir.path().join("one.vtt"))
                .unwrap()
                .contains("WEBVTT"),
            "the output must actually be in the target format"
        );

        let progress = reporter.seen();
        let converting: Vec<&ConvertProgress> = progress
            .iter()
            .filter(|entry| entry.stage == ConvertStage::Converting)
            .collect();
        assert_eq!(converting.len(), 2);
        assert_eq!((converting[0].index, converting[0].total), (1, 2));
        assert_eq!((converting[1].index, converting[1].total), (2, 2));
        assert!(!converting[0].file_name.is_empty());
        assert_eq!(
            progress.last().map(|entry| entry.stage.clone()),
            Some(ConvertStage::Finished),
            "the batch must announce that it stopped"
        );
        assert!(
            !state.is_running().await,
            "the execution slot must be released"
        );
    }

    // @covers convert-workflow/per-item-selection#excluding-an-item
    #[tokio::test]
    async fn an_unselected_item_is_left_untouched() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("wanted.srt"), SRT).unwrap();
        fs::write(dir.path().join("skipped.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(ConvertState::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some(ConvertFormatDto::Vtt), true),
        )
        .await
        .unwrap();
        let wanted = item_named(&plan, "wanted.srt").id;
        let report = execute_conversion_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(RecordingReporter::default()),
            &plan.plan_id,
            &[wanted],
        )
        .await
        .unwrap();

        assert_eq!(report.outcomes.len(), 1, "only the selected item is reported");
        assert!(dir.path().join("wanted.vtt").exists());
        assert!(
            !dir.path().join("skipped.vtt").exists(),
            "an unselected file must not be converted"
        );
    }

    // @covers convert-workflow/per-item-selection#empty-selection-blocks-execution
    #[tokio::test]
    async fn an_empty_selection_converts_nothing() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("episode.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(ConvertState::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some(ConvertFormatDto::Vtt), true),
        )
        .await
        .unwrap();
        let report = execute_conversion_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(RecordingReporter::default()),
            &plan.plan_id,
            &[],
        )
        .await
        .unwrap();

        assert!(report.outcomes.is_empty());
        assert!(!dir.path().join("episode.vtt").exists());
    }

    // @covers convert-workflow/batch-execution-with-progress-cancellation-and-per-item-report#per-item-failure-does-not-abort
    #[tokio::test]
    async fn one_unparsable_file_does_not_stop_the_others() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("broken.srt"), "this is not a subtitle at all").unwrap();
        fs::write(dir.path().join("good.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(ConvertState::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some(ConvertFormatDto::Vtt), true),
        )
        .await
        .unwrap();
        let report = execute_conversion_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(RecordingReporter::default()),
            &plan.plan_id,
            &all_ids(&plan),
        )
        .await
        .unwrap();

        assert_eq!(report.success_count, 1);
        assert_eq!(report.failure_count, 1);
        let failed = report
            .outcomes
            .iter()
            .find(|outcome| outcome.status == ConversionStatusDto::Failed)
            .expect("the broken file must be reported as failed");
        assert_eq!(failed.input_name, "broken.srt");
        assert!(failed.error.is_some(), "a failure must carry its cause");
        assert!(dir.path().join("good.vtt").exists());
    }

    /// The write-ordering guarantee: `convert_file` writes before it validates,
    /// so converting straight to the target would already have destroyed this
    /// file by the time the crate reports the failure.
    // @covers convert-workflow/batch-execution-with-progress-cancellation-and-per-item-report#a-failed-conversion-never-clobbers-an-existing-output
    #[tokio::test]
    async fn a_failed_conversion_leaves_an_existing_output_untouched() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("broken.srt"), "this is not a subtitle at all").unwrap();
        let existing = dir.path().join("broken.vtt");
        fs::write(&existing, "WEBVTT\n\nthe previous, good output\n").unwrap();
        let service = service();
        let state = Arc::new(ConvertState::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some(ConvertFormatDto::Vtt), true),
        )
        .await
        .unwrap();
        let report = execute_conversion_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(RecordingReporter::default()),
            &plan.plan_id,
            &all_ids(&plan),
        )
        .await
        .unwrap();

        assert_eq!(report.failure_count, 1);
        assert_eq!(
            fs::read_to_string(&existing).unwrap(),
            "WEBVTT\n\nthe previous, good output\n",
            "a failed conversion must not replace the file that was there"
        );
        assert!(
            fs::read_dir(dir.path())
                .unwrap()
                .flatten()
                .all(|entry| !entry.file_name().to_string_lossy().contains("subx-convert")),
            "the temporary write must be cleaned up"
        );
    }

    // @covers convert-workflow/batch-execution-with-progress-cancellation-and-per-item-report#delete-original-only-after-success
    #[tokio::test]
    async fn originals_are_removed_only_for_the_items_that_succeeded() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("broken.srt"), "this is not a subtitle at all").unwrap();
        fs::write(dir.path().join("good.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(ConvertState::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some(ConvertFormatDto::Vtt), false),
        )
        .await
        .unwrap();
        let report = execute_conversion_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(RecordingReporter::default()),
            &plan.plan_id,
            &all_ids(&plan),
        )
        .await
        .unwrap();

        assert!(
            !dir.path().join("good.srt").exists(),
            "a converted input is removed when keep-original is off"
        );
        assert!(
            dir.path().join("broken.srt").exists(),
            "a failed input must never be deleted"
        );
        let converted = report
            .outcomes
            .iter()
            .find(|outcome| outcome.input_name == "good.srt")
            .unwrap();
        assert!(converted.original_removed);
        assert!(converted.warning.is_none());
    }

    /// The other half of D4: a removal that fails is reported, not swallowed as
    /// the CLI does — otherwise the report would claim a file the user still has.
    #[cfg(unix)]
    // @covers convert-workflow/batch-execution-with-progress-cancellation-and-per-item-report#delete-original-only-after-success
    #[tokio::test]
    async fn a_failed_removal_is_reported_as_a_warning_on_a_converted_item() {
        use std::os::unix::fs::PermissionsExt;

        let dir = TempDir::new().unwrap();
        // An archive-sourced item reads from the extraction directory and writes
        // beside the archive, so the input's directory can be made unwritable
        // without also breaking the conversion itself.
        let archive = dir.path().join("season1.zip");
        write_zip(&archive, &[("episode.srt", SRT)]);
        let service = service();
        let state = Arc::new(ConvertState::default());

        let plan = preview(
            &service,
            &state,
            vec![archive],
            options(Some(ConvertFormatDto::Vtt), false),
        )
        .await
        .unwrap();
        let extraction_dir = PathBuf::from(&plan.items[0].input_path)
            .parent()
            .expect("an extracted file has a parent")
            .to_path_buf();
        let original = fs::metadata(&extraction_dir).unwrap().permissions();
        fs::set_permissions(&extraction_dir, fs::Permissions::from_mode(0o555)).unwrap();

        // Running as root ignores the directory's mode, so the removal would
        // succeed and this would fail for a reason that is not a regression.
        // Probe rather than guess at the uid: what matters is whether *this*
        // process can still write here.
        let probe = extraction_dir.join("permission-probe");
        if fs::write(&probe, b"x").is_ok() {
            fs::remove_file(&probe).unwrap();
            fs::set_permissions(&extraction_dir, original).unwrap();
            return;
        }

        let report = execute_conversion_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(RecordingReporter::default()),
            &plan.plan_id,
            &all_ids(&plan),
        )
        .await
        .unwrap();

        fs::set_permissions(&extraction_dir, original).unwrap();

        let outcome = &report.outcomes[0];
        assert_eq!(outcome.status, ConversionStatusDto::Converted);
        assert!(!outcome.original_removed);
        assert!(
            outcome.warning.is_some(),
            "a removal failure must reach the report: {outcome:?}"
        );
        assert!(dir.path().join("episode.vtt").exists());
    }

    // @covers convert-workflow/batch-execution-with-progress-cancellation-and-per-item-report#cancellation-stops-between-files
    #[tokio::test]
    async fn cancelling_mid_batch_keeps_finished_outputs_and_starts_nothing_new() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("one.srt"), SRT).unwrap();
        fs::write(dir.path().join("two.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(ConvertState::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some(ConvertFormatDto::Vtt), true),
        )
        .await
        .unwrap();
        let flag = Arc::new(AtomicBool::new(false));
        let report = run_batch(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(CancelDuringFirstFile {
                flag: Arc::clone(&flag),
            }),
            &plan.plan_id,
            &all_ids(&plan),
            flag,
        )
        .await
        .unwrap();

        assert!(report.cancelled);
        assert_eq!(report.success_count, 1, "the in-flight file finishes");
        let cancelled: Vec<&ConversionOutcomeDto> = report
            .outcomes
            .iter()
            .filter(|outcome| outcome.status == ConversionStatusDto::Cancelled)
            .collect();
        assert_eq!(cancelled.len(), 1, "the unprocessed item is still reported");
        assert_eq!(
            fs::read_dir(dir.path())
                .unwrap()
                .flatten()
                .filter(|entry| entry.path().extension().is_some_and(|ext| ext == "vtt"))
                .count(),
            1,
            "no file after the cancel may be started"
        );
    }

    // @covers convert-workflow/batch-execution-with-progress-cancellation-and-per-item-report#stale-plan-is-rejected
    #[tokio::test]
    async fn an_unknown_plan_id_is_rejected_and_releases_the_slot() {
        let state = Arc::new(ConvertState::default());

        let error = execute_conversion_impl(
            service(),
            Arc::clone(&state),
            Arc::new(RecordingReporter::default()),
            "convert-does-not-exist",
            &[0],
        )
        .await
        .expect_err("an unknown plan must be rejected");

        assert_eq!(error.code, CODE_STALE_PLAN);
        assert_eq!(error.hint_code.as_deref(), Some(HINT_STALE_PLAN));
        assert!(
            !state.is_running().await,
            "a rejected batch must not hold the execution slot"
        );
    }

    /// A second batch must not run alongside the first: they would race over
    /// the same output paths, and the loser would report successes it did not
    /// achieve.
    #[tokio::test]
    async fn a_second_batch_is_rejected_while_one_is_running() {
        let state = Arc::new(ConvertState::default());
        state
            .try_begin_execution()
            .await
            .expect("the first batch reserves the slot");

        let error = execute_conversion_impl(
            service(),
            Arc::clone(&state),
            Arc::new(RecordingReporter::default()),
            "convert-1",
            &[0],
        )
        .await
        .expect_err("a concurrent batch must be rejected");

        assert_eq!(error.code, CODE_CONVERSION_IN_PROGRESS);
    }

    /// Selecting an excluded item by hand must not convert it: the plan's
    /// exclusions are a contract, not a UI convenience.
    #[tokio::test]
    async fn a_hand_selected_excluded_item_is_refused() {
        let dir = TempDir::new().unwrap();
        fs::write(dir.path().join("episode.srt"), SRT).unwrap();
        let service = service();
        let state = Arc::new(ConvertState::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some(ConvertFormatDto::Srt), false),
        )
        .await
        .unwrap();
        let report = execute_conversion_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(RecordingReporter::default()),
            &plan.plan_id,
            &all_ids(&plan),
        )
        .await
        .unwrap();

        assert_eq!(report.outcomes[0].status, ConversionStatusDto::Skipped);
        assert_eq!(
            report.outcomes[0].error.as_ref().map(|error| error.code.as_str()),
            Some(CODE_ALREADY_TARGET_FORMAT)
        );
        assert!(
            dir.path().join("episode.srt").exists(),
            "the input must survive: a skipped item is not converted, so it is never removed"
        );
    }

    /// Input encoding is auto-detected and output is always UTF-8, which is the
    /// reason the wizard offers no encoding control (design Context #2).
    #[tokio::test]
    async fn a_non_utf8_input_converts_to_utf8_output() {
        let dir = TempDir::new().unwrap();
        // "你好世界" repeated, encoded in GBK — long enough for the crate's
        // detector to settle on a Chinese encoding rather than guessing Latin-1.
        let mut bytes = b"1\n00:00:01,000 --> 00:00:02,000\n".to_vec();
        for _ in 0..12 {
            bytes.extend_from_slice(&[0xC4, 0xE3, 0xBA, 0xC3, 0xCA, 0xC0, 0xBD, 0xE7]);
        }
        bytes.extend_from_slice(b"\n\n");
        fs::write(dir.path().join("chinese.srt"), &bytes).unwrap();
        let service = service();
        let state = Arc::new(ConvertState::default());

        let plan = preview(
            &service,
            &state,
            vec![dir.path().to_path_buf()],
            options(Some(ConvertFormatDto::Vtt), true),
        )
        .await
        .unwrap();
        let report = execute_conversion_impl(
            Arc::clone(&service),
            Arc::clone(&state),
            Arc::new(RecordingReporter::default()),
            &plan.plan_id,
            &all_ids(&plan),
        )
        .await
        .unwrap();

        assert_eq!(report.success_count, 1, "{:?}", report.outcomes);
        let output = fs::read(dir.path().join("chinese.vtt")).unwrap();
        assert!(
            String::from_utf8(output).is_ok(),
            "the output must be valid UTF-8 whatever the input was"
        );
    }
}
