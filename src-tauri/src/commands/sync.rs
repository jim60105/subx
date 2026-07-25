//! Sync wizard commands.
//!
//! The end-to-end GUI sync flow: read the shared configuration's sync defaults,
//! run a cancellable local VAD detection over one video–subtitle pair, and shift
//! a subtitle by the reviewed offset into a new file. Like every command module
//! this is a thin translation layer — the detection all lives in the crate.
//!
//! Nothing is held between detect and apply (design D1). What detection produces
//! is a single number the user is *meant* to edit, so it round-trips through the
//! frontend and apply re-reads the subtitle; there is no plan, and therefore no
//! staleness protocol.
//!
//! The one place this module does more than translate is the offset shift, which
//! it mirrors from the crate rather than calling. `SyncEngine::new` hard-fails
//! whenever VAD cannot be initialized, *including* for callers that only want
//! `apply_manual_offset` — so routing apply through an engine would break manual
//! offset in exactly the situation manual offset exists for (design D6).

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use subx_cli::cli::sync_args::create_default_output_path;
use subx_cli::config::ConfigService;
use subx_cli::core::formats::manager::FormatManager;
use subx_cli::core::formats::Subtitle;
use subx_cli::core::sync::{SyncEngine, SyncMethod};
use tauri::State;

use crate::dto::{SyncApplyResultDto, SyncDefaultsDto, SyncDetectionDto, SyncMethodDto};
use crate::error::ErrorDto;
use crate::paths::path_key;
use crate::state::{AppState, SyncState};

// Stable error codes the frontend localizes (design D7). Kept as literals so
// `backendCodeParity.test.ts` can find them and demand `en`/`zh-TW` strings.
const CODE_VAD_UNAVAILABLE: &str = "sync.vad_unavailable";
const CODE_DETECTION_IN_PROGRESS: &str = "sync.detection_in_progress";
const CODE_DETECTION_CANCELLED: &str = "sync.detection_cancelled";
const CODE_OFFSET_EXCEEDS_MAX: &str = "sync.offset_exceeds_max";
const CODE_OUTPUT_EXISTS: &str = "sync.output_exists";
const CODE_OUTPUT_IS_INPUT: &str = "sync.output_is_input";
const CODE_DETECTION_WARNING: &str = "sync.detection_warning";

const HINT_VAD_UNAVAILABLE: &str = "sync.vad_unavailable.hint";
const HINT_OFFSET_EXCEEDS_MAX: &str = "sync.offset_exceeds_max.hint";
const HINT_OUTPUT_EXISTS: &str = "sync.output_exists.hint";
const HINT_OUTPUT_IS_INPUT: &str = "sync.output_is_input.hint";

// ─── Command wrappers ───────────────────────────────────────────────────────
// Two lines each: translate DTOs, supply the production seams, delegate.

/// Reads the shared configuration's sync settings for Step 2's controls.
#[tauri::command]
#[specta::specta]
pub async fn get_sync_defaults(state: State<'_, AppState>) -> Result<SyncDefaultsDto, ErrorDto> {
    sync_defaults(state.config_service())
}

/// Runs a cancellable local VAD detection over the pair and returns the offset,
/// its confidence, and any warnings the analysis produced.
#[tauri::command]
#[specta::specta]
pub async fn detect_sync_offset(
    media_path: String,
    subtitle_path: String,
    sensitivity: Option<u32>,
    state: State<'_, AppState>,
) -> Result<SyncDetectionDto, ErrorDto> {
    detect_sync_offset_impl(
        state.config_service_arc(),
        state.sync_state(),
        PathBuf::from(media_path),
        PathBuf::from(subtitle_path),
        sensitivity,
    )
    .await
}

/// Abandons a running detection (design D2).
#[tauri::command]
#[specta::specta]
pub async fn cancel_sync_detection(state: State<'_, AppState>) -> Result<(), ErrorDto> {
    state.sync_state().cancel().await;
    Ok(())
}

/// Shifts the subtitle by the reviewed offset and saves it to a new file.
#[tauri::command]
#[specta::specta]
pub async fn apply_sync_offset(
    subtitle_path: String,
    offset_ms: i32,
    output_path: Option<String>,
    overwrite: bool,
    state: State<'_, AppState>,
) -> Result<SyncApplyResultDto, ErrorDto> {
    apply_sync_offset_impl(
        state.config_service(),
        &PathBuf::from(subtitle_path),
        offset_ms,
        output_path.map(PathBuf::from).as_deref(),
        overwrite,
    )
}

// ─── Implementations ────────────────────────────────────────────────────────

/// The sync section of the shared configuration, as Step 2 reads it.
fn sync_defaults(service: &dyn ConfigService) -> Result<SyncDefaultsDto, ErrorDto> {
    // The user may have edited the file (or run the CLI) since the last read;
    // `ProductionConfigService` caches and never re-reads on its own.
    service.reload().map_err(ErrorDto::from)?;
    let config = service.get_config().map_err(ErrorDto::from)?;

    Ok(SyncDefaultsDto {
        default_method: default_method_of(&config.sync.default_method),
        vad_sensitivity: ratio_to_percent(config.sync.vad.sensitivity),
        max_offset_ms: seconds_to_ms(config.sync.max_offset_seconds),
    })
}

/// Orchestrates one detection: guard, spawn, await, publish.
///
/// The work runs in a spawned task so `cancel_sync_detection` can abandon it
/// mid-flight. The slot is reserved *before* the spawn, so a losing concurrent
/// caller decodes no audio at all, and the epoch it pins is what decides
/// afterwards whether the result may still be shown (design D2).
async fn detect_sync_offset_impl(
    service: Arc<dyn ConfigService>,
    sync_state: Arc<SyncState>,
    media: PathBuf,
    subtitle: PathBuf,
    sensitivity: Option<u32>,
) -> Result<SyncDetectionDto, ErrorDto> {
    let epoch = sync_state
        .try_begin_detection()
        .await
        .map_err(|()| detection_in_progress())?;

    let task = tokio::spawn(run_detection(service, media, subtitle, sensitivity));
    // Registering under the epoch closes the window between the reservation and
    // the spawn: a cancel landing in it finds no handle to abort, so `set_running`
    // is what aborts this task instead of adopting it into a slot a newer
    // detection may already own (see `SyncState::set_running`).
    sync_state.set_running(epoch, task.abort_handle()).await;

    let detection = match task.await {
        Ok(Ok(detection)) => detection,
        Ok(Err(err)) => {
            sync_state.finish_detection(epoch).await;
            return Err(err);
        }
        // `cancel_sync_detection` aborted us; it already released the slot and
        // bumped the epoch. The frontend has left the step and ignores this.
        Err(join) if join.is_cancelled() => return Err(detection_cancelled()),
        Err(_) => {
            sync_state.finish_detection(epoch).await;
            return Err(ErrorDto::new("core.other", "the detection task panicked"));
        }
    };

    // The abort may have missed: VAD is CPU-bound between `.await` points, so a
    // cancel can land after the last one. The epoch, not the abort, is what
    // guarantees a cancelled detection never surfaces a result.
    if sync_state.commit(epoch).await {
        Ok(detection)
    } else {
        Err(detection_cancelled())
    }
}

/// One detection, start to finish, on its own task.
async fn run_detection(
    service: Arc<dyn ConfigService>,
    media: PathBuf,
    subtitle_path: PathBuf,
    sensitivity: Option<u32>,
) -> Result<SyncDetectionDto, ErrorDto> {
    service.reload().map_err(ErrorDto::from)?;
    let config = service.get_config().map_err(ErrorDto::from)?;

    // Per-run override on a clone, mirroring the CLI's `apply_cli_overrides`:
    // the sensitivity slider tunes this detection only and the shared config
    // file — which the CLI reads too — is never written (design D4).
    let mut sync_config = config.sync.clone();
    if let Some(sensitivity) = sensitivity {
        sync_config.vad.sensitivity = percent_to_ratio(sensitivity);
    }
    let method = detection_method_of(&sync_config.default_method);

    // `SyncEngine::new` fails whenever the VAD detector cannot be built, which
    // is the *only* thing it can fail on — hence the flat mapping. This is also
    // the only engine construction in the module: apply must never reach here
    // (design D6), or manual offset would break exactly when VAD is missing.
    let engine = SyncEngine::new(sync_config).map_err(|err| vad_unavailable(&err.to_string()))?;

    let subtitle = load_subtitle(&subtitle_path)?;
    let result = engine
        .detect_sync_offset(&media, &subtitle, Some(method))
        .await
        .map_err(ErrorDto::from)?;

    Ok(SyncDetectionDto {
        offset_ms: seconds_to_ms(result.offset_seconds),
        confidence: ratio_to_percent(result.confidence),
        warnings: result
            .warnings
            .into_iter()
            .map(|warning| ErrorDto::new(CODE_DETECTION_WARNING, warning))
            .collect(),
    })
}

/// Applies the reviewed offset and writes the result to a new file.
///
/// Everything that can refuse the write is checked before the subtitle is even
/// read, so a refusal costs nothing and — more to the point — leaves the output
/// path exactly as it was.
fn apply_sync_offset_impl(
    service: &dyn ConfigService,
    subtitle_path: &Path,
    offset_ms: i32,
    output_path: Option<&Path>,
    overwrite: bool,
) -> Result<SyncApplyResultDto, ErrorDto> {
    service.reload().map_err(ErrorDto::from)?;
    let config = service.get_config().map_err(ErrorDto::from)?;
    let max_offset_seconds = config.sync.max_offset_seconds;

    // The apply-time half of design D4: the frontend checks this too, but that
    // check is UX. This one is the boundary.
    //
    // Compared in whole milliseconds rather than seconds, because whole
    // milliseconds are what `get_sync_defaults` handed the frontend to validate
    // against. Re-deriving the limit from the raw `f32` here would put the two
    // checks on either side of a rounding boundary: with
    // `max_offset_seconds = 30.0006`, `max_offset_ms` is 30001, and an offset of
    // exactly 30001 ms would pass the frontend gate and then be refused here.
    // `saturating_abs` because `i32::MIN.abs()` panics.
    let max_offset_ms = seconds_to_ms(max_offset_seconds);
    let offset_seconds = offset_ms as f32 / 1000.0;
    if offset_ms.saturating_abs() > max_offset_ms {
        return Err(offset_exceeds_max(offset_seconds, max_offset_seconds));
    }

    let output = match output_path {
        Some(path) => path.to_path_buf(),
        None => create_default_output_path(subtitle_path),
    };
    // "The original is never modified in place" has three ways to fail: the
    // user types the input path into the output field; a subtitle with no
    // extension, for which the crate's helper has no `_synced` name to build and
    // hands the input straight back; and — only on a case-insensitive
    // filesystem — an output that differs from the input by case alone. The
    // third is the dangerous one: raw equality misses it, the existence check
    // below then reports the *input* as a file that already exists, and a user
    // who confirms that overwrite gets their original shifted on top of itself.
    // `path_key` folds exactly where the filesystem does.
    if path_key(&output) == path_key(subtitle_path) {
        return Err(output_is_input());
    }
    let overwritten = output.exists();
    if overwritten && !overwrite {
        return Err(output_exists());
    }

    let mut subtitle = load_subtitle(subtitle_path)?;
    shift_subtitle(&mut subtitle, offset_seconds)?;
    save_subtitle(&subtitle, &output)?;

    Ok(SyncApplyResultDto {
        output_path: output.display().to_string(),
        overwritten,
    })
}

/// Shifts every cue by `offset_seconds`.
///
/// A line-for-line mirror of `subx-cli`'s `core/sync/engine.rs::apply_manual_offset`,
/// duplicated because that method is reachable only through a `SyncEngine`, and
/// constructing one requires a working VAD detector (design D6). The two rules
/// that must not drift are both asserted in the tests below: a positive offset
/// *errors* on overflow, and a negative one *clamps* to zero rather than
/// underflowing.
fn shift_subtitle(subtitle: &mut Subtitle, offset_seconds: f32) -> Result<(), ErrorDto> {
    let magnitude = Duration::from_secs_f32(offset_seconds.abs());

    for entry in &mut subtitle.entries {
        if offset_seconds >= 0.0 {
            entry.start_time = entry.start_time.checked_add(magnitude).ok_or_else(overflowed)?;
            entry.end_time = entry.end_time.checked_add(magnitude).ok_or_else(overflowed)?;
        } else {
            entry.start_time = entry.start_time.saturating_sub(magnitude);
            entry.end_time = entry.end_time.saturating_sub(magnitude);
        }
    }

    Ok(())
}

// ─── Pure helpers ───────────────────────────────────────────────────────────

/// Whole milliseconds, as the CLI's JSON payload computes them.
fn seconds_to_ms(seconds: f32) -> i32 {
    (seconds * 1000.0).round() as i32
}

/// A crate ratio (`0.0..=1.0`) as a whole percentage, clamped because the
/// conversion is also what keeps a stray NaN or out-of-range value from
/// crossing the boundary as something the frontend has to defend against.
fn ratio_to_percent(ratio: f32) -> u32 {
    (ratio.clamp(0.0, 1.0) * 100.0).round() as u32
}

/// The inverse, for the per-run sensitivity override.
fn percent_to_ratio(percent: u32) -> f32 {
    (percent.min(100) as f32) / 100.0
}

/// Which method the wizard preselects for a configured `sync.default_method`.
///
/// Only `manual` is a distinct choice: the crate routes both `auto` and `vad`
/// through the same VAD detector, so they are one automatic option here.
fn default_method_of(configured: &str) -> SyncMethodDto {
    match configured {
        "manual" => SyncMethodDto::Manual,
        _ => SyncMethodDto::Auto,
    }
}

/// The engine method a detection runs with, mirroring the crate's
/// `determine_default_method`. `Manual` is unreachable — the engine rejects it,
/// and a manual offset never starts a detection in the first place.
fn detection_method_of(configured: &str) -> SyncMethod {
    match configured {
        "vad" => SyncMethod::LocalVad,
        _ => SyncMethod::Auto,
    }
}

/// Parses a subtitle file, encoding detection included.
///
/// The `FormatManager` is built and dropped inside this call on purpose: it owns
/// boxed format handlers that are neither `Send` nor `Sync`, so one held across
/// the detection `.await` would make the spawned task's future non-`Send` — the
/// same crate constraint `commands::convert` meets with `spawn_blocking`.
fn load_subtitle(path: &Path) -> Result<Subtitle, ErrorDto> {
    FormatManager::new()
        .load_subtitle(path)
        .map_err(ErrorDto::from)
}

fn save_subtitle(subtitle: &Subtitle, path: &Path) -> Result<(), ErrorDto> {
    FormatManager::new()
        .save_subtitle(subtitle, path)
        .map_err(ErrorDto::from)
}

// ─── Error mapping ──────────────────────────────────────────────────────────

fn vad_unavailable(detail: &str) -> ErrorDto {
    ErrorDto::new(CODE_VAD_UNAVAILABLE, detail).with_hint(HINT_VAD_UNAVAILABLE)
}

fn detection_in_progress() -> ErrorDto {
    ErrorDto::new(CODE_DETECTION_IN_PROGRESS, "a detection is already running")
}

fn detection_cancelled() -> ErrorDto {
    ErrorDto::new(CODE_DETECTION_CANCELLED, "the detection was cancelled")
}

/// Carries both numbers so the technical detail names the limit that was hit,
/// the way the crate's own rejection does.
fn offset_exceeds_max(offset_seconds: f32, max_offset_seconds: f32) -> ErrorDto {
    ErrorDto::new(
        CODE_OFFSET_EXCEEDS_MAX,
        format!(
            "Offset {offset_seconds:.2}s exceeds the configured maximum of {max_offset_seconds:.2}s"
        ),
    )
    .with_hint(HINT_OFFSET_EXCEEDS_MAX)
}

fn output_exists() -> ErrorDto {
    ErrorDto::new(CODE_OUTPUT_EXISTS, "the output file already exists")
        .with_hint(HINT_OUTPUT_EXISTS)
}

fn output_is_input() -> ErrorDto {
    ErrorDto::new(
        CODE_OUTPUT_IS_INPUT,
        "the output path is the subtitle being synced",
    )
    .with_hint(HINT_OUTPUT_IS_INPUT)
}

fn overflowed() -> ErrorDto {
    ErrorDto::from(subx_cli::error::SubXError::audio_processing(
        "Invalid offset results in a timestamp beyond the representable range",
    ))
}

#[cfg(test)]
mod tests {
    use std::fs;

    use subx_cli::config::TestConfigService;
    use tempfile::TempDir;

    use super::*;

    /// One cue at 5 s – 7 s, the fixture every timing assertion below reads.
    const SRT: &str = "1\n00:00:05,000 --> 00:00:07,000\nhello\n\n";

    fn service() -> TestConfigService {
        TestConfigService::with_defaults()
    }

    /// A service whose VAD is switched off, i.e. one on which `SyncEngine::new`
    /// cannot succeed.
    fn service_without_vad() -> TestConfigService {
        let service = TestConfigService::with_defaults();
        service
            .set_config_value("sync.vad.enabled", "false")
            .expect("VAD must be switchable off");
        service
    }

    fn subtitle_at(dir: &TempDir, name: &str) -> PathBuf {
        let path = dir.path().join(name);
        fs::write(&path, SRT).expect("the fixture must be writable");
        path
    }

    /// The first cue's start and end, in whole milliseconds.
    fn first_cue_ms(path: &Path) -> (u128, u128) {
        let subtitle = load_subtitle(path).expect("the output must parse");
        let entry = &subtitle.entries[0];
        (entry.start_time.as_millis(), entry.end_time.as_millis())
    }

    // ─── Defaults ───────────────────────────────────────────────────────────

    // @covers sync-workflow/method-selection-seeded-from-shared-configuration#defaults-come-from-the-shared-configuration
    #[test]
    fn the_defaults_are_read_from_the_shared_configuration() {
        let service = service();
        service.set_config_value("sync.vad.sensitivity", "0.4").unwrap();
        service.set_config_value("sync.max_offset_seconds", "45.0").unwrap();

        let defaults = sync_defaults(&service).expect("the defaults must be readable");

        assert_eq!(defaults.vad_sensitivity, 40);
        assert_eq!(defaults.max_offset_ms, 45_000);
        assert_eq!(defaults.default_method, SyncMethodDto::Auto);
    }

    /// A per-run sensitivity is an argument to one detection, never a write:
    /// the shared file is what the CLI reads too.
    // @covers sync-workflow/method-selection-seeded-from-shared-configuration#defaults-come-from-the-shared-configuration
    #[tokio::test]
    async fn a_per_run_sensitivity_override_does_not_touch_the_configuration() {
        let dir = TempDir::new().unwrap();
        let subtitle = subtitle_at(&dir, "episode.srt");
        let service = service();
        service.set_config_value("sync.vad.sensitivity", "0.4").unwrap();
        let service: Arc<dyn ConfigService> = Arc::new(service);

        // The media file is nonsense, so the detection fails — but only *after*
        // the override has been applied to the cloned config, which is the step
        // under test.
        let _ = run_detection(
            Arc::clone(&service),
            dir.path().join("not-a-video.mkv"),
            subtitle,
            Some(90),
        )
        .await;

        assert_eq!(
            sync_defaults(service.as_ref()).unwrap().vad_sensitivity,
            40,
            "a per-run override must not be written back to the shared config"
        );
    }

    #[test]
    fn only_a_manual_default_preselects_manual() {
        assert_eq!(default_method_of("manual"), SyncMethodDto::Manual);
        // Both of the crate's automatic values route to the same VAD detector,
        // so the wizard shows one automatic option for either.
        assert_eq!(default_method_of("auto"), SyncMethodDto::Auto);
        assert_eq!(default_method_of("vad"), SyncMethodDto::Auto);
        assert_eq!(detection_method_of("vad"), SyncMethod::LocalVad);
        assert_eq!(detection_method_of("auto"), SyncMethod::Auto);
    }

    // ─── Detection guard ────────────────────────────────────────────────────

    // @covers sync-workflow/cancellable-local-offset-detection-with-review-and-fine-tuning#concurrent-detection-is-rejected
    #[tokio::test]
    async fn a_second_detection_is_rejected_while_one_is_running() {
        let state = Arc::new(SyncState::default());
        state
            .try_begin_detection()
            .await
            .expect("the first detection reserves the slot");

        let error = detect_sync_offset_impl(
            Arc::new(service()),
            Arc::clone(&state),
            PathBuf::from("/media/episode.mkv"),
            PathBuf::from("/media/episode.srt"),
            None,
        )
        .await
        .expect_err("a concurrent detection must be rejected");

        assert_eq!(error.code, CODE_DETECTION_IN_PROGRESS);
        assert!(
            state.is_running().await,
            "the rejected caller must not release the running detection's slot"
        );
    }

    /// The cancel-race guarantee, asserted where it is decidable: a cancel that
    /// lands after the abort point still discards the result, because the epoch
    /// — not the abort — is what the commit consults.
    // @covers sync-workflow/cancellable-local-offset-detection-with-review-and-fine-tuning#user-cancels-detection
    #[tokio::test]
    async fn a_result_that_arrives_after_a_cancel_is_discarded() {
        let state = Arc::new(SyncState::default());
        let epoch = state.try_begin_detection().await.unwrap();

        state.cancel().await;

        assert!(
            !state.commit(epoch).await,
            "a detection the user cancelled must not publish its result"
        );
        assert!(!state.is_running().await);
    }

    // @covers sync-workflow/cancellable-local-offset-detection-with-review-and-fine-tuning#vad-is-unavailable
    #[tokio::test]
    async fn detection_without_vad_reports_that_vad_is_unavailable() {
        let dir = TempDir::new().unwrap();
        let subtitle = subtitle_at(&dir, "episode.srt");

        let error = detect_sync_offset_impl(
            Arc::new(service_without_vad()),
            Arc::new(SyncState::default()),
            dir.path().join("episode.mkv"),
            subtitle,
            None,
        )
        .await
        .expect_err("detection must fail when the engine cannot be built");

        assert_eq!(error.code, CODE_VAD_UNAVAILABLE);
        assert_eq!(error.hint_code.as_deref(), Some(HINT_VAD_UNAVAILABLE));
    }

    /// Design D6's promise, and the reason apply never builds an engine: the
    /// flow the wizard falls back to when VAD is missing must work *without*
    /// VAD. Paired with the test above, which proves the same config really is
    /// one an engine cannot be built from.
    // @covers sync-workflow/cancellable-local-offset-detection-with-review-and-fine-tuning#vad-is-unavailable
    #[test]
    fn a_manual_offset_still_applies_when_vad_is_unavailable() {
        let dir = TempDir::new().unwrap();
        let subtitle = subtitle_at(&dir, "episode.srt");

        let result = apply_sync_offset_impl(&service_without_vad(), &subtitle, 1_000, None, false)
            .expect("manual offset must not depend on VAD");

        assert_eq!(first_cue_ms(Path::new(&result.output_path)), (6_000, 8_000));
    }

    // ─── Apply ──────────────────────────────────────────────────────────────

    // @covers sync-workflow/applying-the-offset-writes-a-new-output-with-overwrite-protection#default-output-path-is-proposed
    // @covers sync-workflow/applying-the-offset-writes-a-new-output-with-overwrite-protection#applied-offset-shifts-the-subtitle-timing
    #[test]
    fn the_offset_lands_in_a_synced_sibling_and_leaves_the_input_alone() {
        let dir = TempDir::new().unwrap();
        let subtitle = subtitle_at(&dir, "movie.srt");

        let result = apply_sync_offset_impl(&service(), &subtitle, 1_000, None, false)
            .expect("the apply must succeed");

        assert_eq!(PathBuf::from(&result.output_path), dir.path().join("movie_synced.srt"));
        assert!(!result.overwritten);
        assert_eq!(first_cue_ms(Path::new(&result.output_path)), (6_000, 8_000));
        assert_eq!(
            first_cue_ms(&subtitle),
            (5_000, 7_000),
            "the original must never be modified in place"
        );
    }

    /// The crate clamps a negative offset at zero rather than underflowing, and
    /// the mirror has to agree: this is the rule most likely to drift.
    #[test]
    fn a_negative_offset_clamps_at_zero_exactly_as_the_crate_does() {
        let dir = TempDir::new().unwrap();
        let subtitle = subtitle_at(&dir, "movie.srt");

        let result = apply_sync_offset_impl(&service(), &subtitle, -6_000, None, false)
            .expect("the apply must succeed");

        assert_eq!(
            first_cue_ms(Path::new(&result.output_path)),
            (0, 1_000),
            "a cue shifted past zero is clamped, not wrapped or rejected"
        );
    }

    #[test]
    fn a_positive_offset_beyond_the_representable_range_is_rejected() {
        let mut subtitle = load_subtitle(&subtitle_at(&TempDir::new().unwrap(), "movie.srt"))
            .expect("the fixture must parse");
        subtitle.entries[0].start_time = Duration::MAX;

        let error = shift_subtitle(&mut subtitle, 1.0).expect_err("the overflow must be reported");

        assert_eq!(error.code, "core.audio_processing");
    }

    // @covers sync-workflow/method-selection-seeded-from-shared-configuration#manual-offset-beyond-the-configured-maximum-is-rejected
    #[test]
    fn an_offset_beyond_the_configured_maximum_is_rejected_at_apply() {
        let dir = TempDir::new().unwrap();
        let subtitle = subtitle_at(&dir, "movie.srt");
        let service = service();
        service.set_config_value("sync.max_offset_seconds", "30.0").unwrap();

        let error = apply_sync_offset_impl(&service, &subtitle, 45_000, None, false)
            .expect_err("an over-limit offset must be rejected");

        assert_eq!(error.code, CODE_OFFSET_EXCEEDS_MAX);
        assert_eq!(error.hint_code.as_deref(), Some(HINT_OFFSET_EXCEEDS_MAX));
        assert!(
            error.message.contains("30.00"),
            "the detail must name the limit that was hit: {}",
            error.message
        );
        assert!(
            !dir.path().join("movie_synced.srt").exists(),
            "a rejected offset must write nothing"
        );
    }

    // @covers sync-workflow/applying-the-offset-writes-a-new-output-with-overwrite-protection#existing-output-requires-confirmation
    #[test]
    fn an_existing_output_is_refused_until_the_overwrite_is_confirmed() {
        let dir = TempDir::new().unwrap();
        let subtitle = subtitle_at(&dir, "movie.srt");
        let output = dir.path().join("movie_synced.srt");
        fs::write(&output, "1\n00:00:01,000 --> 00:00:02,000\nthe previous output\n\n").unwrap();

        let error = apply_sync_offset_impl(&service(), &subtitle, 1_000, None, false)
            .expect_err("an existing output must be refused");

        assert_eq!(error.code, CODE_OUTPUT_EXISTS);
        assert_eq!(error.hint_code.as_deref(), Some(HINT_OUTPUT_EXISTS));
        assert_eq!(
            first_cue_ms(&output),
            (1_000, 2_000),
            "the refusal must leave the existing file untouched"
        );

        // The confirm-retry: the same call with the flag set (design D5).
        let result = apply_sync_offset_impl(&service(), &subtitle, 1_000, None, true)
            .expect("confirming must let the write through");

        assert!(result.overwritten);
        assert_eq!(first_cue_ms(&output), (6_000, 8_000));
    }

    #[test]
    fn an_explicit_output_path_is_used_as_given() {
        let dir = TempDir::new().unwrap();
        let subtitle = subtitle_at(&dir, "movie.srt");
        let chosen = dir.path().join("elsewhere.srt");

        let result = apply_sync_offset_impl(&service(), &subtitle, 1_000, Some(&chosen), false)
            .expect("the apply must succeed");

        assert_eq!(PathBuf::from(&result.output_path), chosen);
        assert_eq!(first_cue_ms(&chosen), (6_000, 8_000));
    }

    /// The in-place guard, from both directions: an output typed to equal the
    /// input, and the silent case — an extensionless subtitle, for which the
    /// crate's default-path helper hands the input straight back.
    #[test]
    fn writing_over_the_subtitle_being_synced_is_refused() {
        let dir = TempDir::new().unwrap();
        let subtitle = subtitle_at(&dir, "movie.srt");

        let error = apply_sync_offset_impl(&service(), &subtitle, 1_000, Some(&subtitle), true)
            .expect_err("the input must never be the output");
        assert_eq!(error.code, CODE_OUTPUT_IS_INPUT);
        assert_eq!(error.hint_code.as_deref(), Some(HINT_OUTPUT_IS_INPUT));
        assert_eq!(first_cue_ms(&subtitle), (5_000, 7_000));

        let extensionless = dir.path().join("movie");
        fs::write(&extensionless, SRT).unwrap();
        let error = apply_sync_offset_impl(&service(), &extensionless, 1_000, None, true)
            .expect_err("a defaulted path that resolves to the input must be refused too");
        assert_eq!(error.code, CODE_OUTPUT_IS_INPUT);
    }

    /// The two limits have to be the same limit. `get_sync_defaults` hands the
    /// frontend whole milliseconds to validate against; if apply re-derived its
    /// own bound from the raw `f32` seconds, a value the UI called legal could
    /// be refused here on the far side of a rounding boundary.
    // @covers sync-workflow/method-selection-seeded-from-shared-configuration#manual-offset-beyond-the-configured-maximum-is-rejected
    #[test]
    fn the_largest_offset_the_frontend_is_told_about_is_accepted() {
        let dir = TempDir::new().unwrap();
        let subtitle = subtitle_at(&dir, "movie.srt");
        let service = service();
        // Deliberately not a whole number of milliseconds: 30.0006 s rounds to
        // 30001 ms, so the two bounds disagree unless they are the same one.
        service
            .set_config_value("sync.max_offset_seconds", "30.0006")
            .unwrap();
        let limit = sync_defaults(&service).unwrap().max_offset_ms;

        let result = apply_sync_offset_impl(&service, &subtitle, limit, None, false)
            .expect("exactly the advertised limit must be accepted");

        assert_eq!(limit, 30_001);
        assert!(PathBuf::from(&result.output_path).exists());
        assert_eq!(
            apply_sync_offset_impl(&service, &subtitle, limit + 1, None, true)
                .expect_err("one millisecond past it must not be")
                .code,
            CODE_OFFSET_EXCEEDS_MAX
        );
    }

    /// The in-place guard has to fold case exactly where the filesystem does.
    /// On macOS/Windows `Movie.srt` and `movie.srt` are one file, so shifting
    /// one onto the other would rewrite the original — and raw path equality
    /// would wave it through, since the existence check that follows reports
    /// only "a file is already there", which the user can confirm away.
    #[test]
    fn an_output_differing_from_the_input_by_case_alone_is_refused_where_it_is_the_same_file() {
        let dir = TempDir::new().unwrap();
        let subtitle = subtitle_at(&dir, "Movie.srt");
        let aliased = dir.path().join("movie.srt");

        let outcome = apply_sync_offset_impl(&service(), &subtitle, 1_000, Some(&aliased), true);

        if cfg!(any(target_os = "macos", target_os = "windows")) {
            assert_eq!(
                outcome.expect_err("one file must not be its own output").code,
                CODE_OUTPUT_IS_INPUT
            );
            assert_eq!(
                first_cue_ms(&subtitle),
                (5_000, 7_000),
                "the original must be untouched"
            );
        } else {
            outcome.expect("on a case-sensitive filesystem these are two files");
            assert_eq!(first_cue_ms(&aliased), (6_000, 8_000));
            assert_eq!(first_cue_ms(&subtitle), (5_000, 7_000));
        }
    }

    // ─── Conversions ────────────────────────────────────────────────────────

    /// Rounding, not truncation — the CLI's own `(seconds * 1000).round()`.
    #[test]
    fn seconds_become_whole_milliseconds() {
        assert_eq!(seconds_to_ms(1.5), 1_500);
        assert_eq!(seconds_to_ms(-1.25), -1_250);
        assert_eq!(seconds_to_ms(0.0006), 1);
        assert_eq!(seconds_to_ms(60.0), 60_000);
    }

    /// Percentages round-trip, and the clamp holds for the values `f32` can
    /// carry but a percentage cannot represent.
    #[test]
    fn ratios_become_whole_percentages() {
        assert_eq!(ratio_to_percent(0.4), 40);
        assert_eq!(ratio_to_percent(0.755), 76);
        assert_eq!(ratio_to_percent(1.0), 100);
        assert_eq!(ratio_to_percent(f32::NAN), 0, "NaN must not cross as a percentage");
        assert_eq!(ratio_to_percent(2.5), 100);
        assert_eq!(ratio_to_percent(-1.0), 0);
        assert_eq!(percent_to_ratio(40), 0.4);
        assert_eq!(percent_to_ratio(250), 1.0);
    }
}
