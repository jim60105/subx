//! Serde DTOs crossing the Tauri IPC boundary.
//!
//! Every type here has a TypeScript mirror in `src/types/`. Canonical rich
//! Rust data stays in backend state (`state.rs`); the frontend only receives
//! display-oriented DTOs and sends back identifiers.

use serde::{Deserialize, Serialize};
use specta::Type;

use crate::error::ErrorDto;

/// Response of the `ping` reference command.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct PingResponse {
    /// Always `"pong"`.
    pub message: String,
    /// The GUI application version.
    pub app_version: String,
}

/// The AI section of the shared CLI configuration, as shown in the GUI.
///
/// The API key never crosses the IPC boundary in cleartext: only its masked
/// form does, and there is no command that returns the raw value.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct AiConfigDto {
    /// Canonical provider id (`openai`, `openrouter`, `azure-openai`, `local`).
    pub provider: String,
    pub model: String,
    pub base_url: String,
    /// Masked key (e.g. `****abcd`), empty when no key is configured.
    pub api_key_masked: String,
    /// Whether a key is configured at all — distinguishes "unset" from a key
    /// too short to produce a meaningful mask.
    pub api_key_set: bool,
}

/// Configuration as presented by `get_config`.
///
/// Grouped by config-file section so later changes can add sections without
/// reshaping what the settings screen already reads.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConfigDto {
    pub ai: AiConfigDto,
}

/// A single `key = value` write against the shared configuration.
///
/// Writes are per-key, mirroring `subx-cli config set <key> <value>`; the
/// settings screen sends one request per changed field.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SetConfigRequest {
    /// Dotted config key, e.g. `ai.provider`.
    pub key: String,
    pub value: String,
}

/// Outcome of an explicit AI connection test.
///
/// A rejected connection is a result, not a command failure, so the command
/// resolves with `ok: false` and an embedded `ErrorDto` the frontend localizes
/// through the same path as any other error.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub ok: bool,
    /// Round-trip time of the probe request; present only on success.
    ///
    /// `u32`, not `u64`: this crosses into JavaScript, whose numbers are f64 and
    /// exact only to 2^53. Specta refuses to export a 64-bit integer as `number`
    /// for that reason, and it is right to — the hand-written mirror this
    /// replaces declared `latencyMs?: number` and quietly claimed a range the
    /// receiver cannot represent. A probe latency has no use for more than the
    /// 49 days `u32` milliseconds already covers.
    pub latency_ms: Option<u32>,
    /// Why the test failed; present only on failure.
    pub error: Option<ErrorDto>,
}

/// Relocation mode chosen in Step 1 of the match wizard.
///
/// Maps onto `subx_cli`'s `FileRelocationMode`: `Rename` is the crate's `None`
/// (rename the subtitle in place) and is the wizard's default. The mode is
/// baked into every operation at analysis time (design D4), so it is picked
/// before analysis and echoed back on the plan for the Step 4 summary.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum RelocationModeDto {
    Rename,
    Copy,
    Move,
}

/// Scan preview returned by `list_source_files` before any AI call.
///
/// Counts are enough for the Step 1 preview and the insufficient-sources gate;
/// the canonical file lists never leave the backend (they include temporary
/// archive-extraction paths that must not become the frontend's concern).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SourceScanResult {
    pub video_count: u32,
    pub subtitle_count: u32,
}

/// One proposed match operation, referenced by the frontend via `id` only.
///
/// `id` is the operation's index in the backend-held plan; the canonical
/// `MatchOperation` never crosses IPC (design D1). `confidence` is a whole
/// percentage `0..=100` rather than the crate's `0.0..=1.0` `f32`, so the
/// review UI has nothing to round.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MatchOperationDto {
    pub id: u32,
    pub subtitle_name: String,
    pub target_path: String,
    pub confidence: u32,
    /// The AI's reasoning, shown verbatim (design D7).
    pub reasoning: Vec<String>,
}

/// A video with at least one matched subtitle (design D7).
///
/// Videos with no match appear only in `MatchPlanDto::unmatched_videos`, never
/// here.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MatchedVideoDto {
    pub video_name: String,
    pub matches: Vec<MatchOperationDto>,
}

/// The reviewable plan the frontend renders in Step 3.
///
/// `plan_id` ties a later `execute_selected` back to this exact analysis; a
/// newer analysis replaces it and the old id becomes stale (design D1).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MatchPlanDto {
    pub plan_id: String,
    pub relocation_mode: RelocationModeDto,
    pub videos: Vec<MatchedVideoDto>,
    /// Videos in the scan referenced by no operation (design D6).
    pub unmatched_videos: Vec<String>,
    /// Subtitles in the scan referenced by no operation (design D6).
    pub unmatched_subtitles: Vec<String>,
}

/// One executed operation's outcome in the Step 4 report.
///
/// `error` carries a localizable `ErrorDto` (its `code` reuses the shared
/// `core.<category>` keys) so a per-item failure renders the same way as any
/// other error, without aborting the run (design D8).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionOutcomeDto {
    pub subtitle_name: String,
    pub target_path: String,
    pub applied: bool,
    pub error: Option<ErrorDto>,
}

/// The final execution report returned by `execute_selected`.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ExecutionReportDto {
    pub outcomes: Vec<ExecutionOutcomeDto>,
    pub success_count: u32,
    pub failure_count: u32,
}

/// Analysis stage reported to the UI's staged indicator (design D2).
///
/// `Analyzing` is deliberately neutral: `match_file_list_with_audit` may
/// resolve from the crate's cache with no AI request, and the label must not
/// claim one happened.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum MatchStage {
    Scanning,
    Analyzing,
    Finalizing,
}

/// A progress message pushed over the analysis `Channel` (design D2).
///
/// The wizard reports progress through a per-invocation `tauri::ipc::Channel`
/// rather than a `tauri_specta::Event`. A command that emits an `Event` must
/// hold a runtime-generic `AppHandle<R>`, and a generic command cannot be
/// registered in the single runtime-generic `specta_builder` that
/// `add-typed-ipc-bindings` locked in — the macro cannot infer `R`. A `Channel`
/// is runtime-agnostic, keeps the command non-generic, and scopes progress to
/// the one analysis that owns it. See design D2.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct MatchProgress {
    pub stage: MatchStage,
}

/// Target format of a conversion run.
///
/// Exactly the four the crate can serialize; SMI and LRC stay readable inputs
/// with no way to become outputs, so offering them would be a dead choice.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ConvertFormatDto {
    Srt,
    Ass,
    Vtt,
    Sub,
}

/// Scan preview returned by `list_convert_inputs` before any plan exists.
///
/// A count is all Step 1 needs; the file list — which includes temporary
/// archive-extraction paths — never leaves the backend.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConvertScanResult {
    pub subtitle_count: u32,
}

/// The options a preview is computed from.
///
/// `target_format` is optional because the wizard's Step 2 has to render the
/// configured default before the user has chosen anything: a `null` means
/// "resolve `formats.default_output` from the shared config", and the resulting
/// plan echoes back what was used (design D6).
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConvertOptionsDto {
    pub target_format: Option<ConvertFormatDto>,
    pub keep_original: bool,
}

/// One planned conversion, referenced by the frontend via `id` only.
///
/// `id` is the item's index in the backend-held plan. `skip_reason` carries a
/// stable code (`convert.already_target_format`, `convert.output_collision`)
/// when the item cannot run; such items are excluded from execution, and the
/// skip is evaluated before `output_exists` so a skipped item is never *also*
/// presented as an overwrite (design D2).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConvertItemDto {
    pub id: u32,
    pub input_name: String,
    pub input_path: String,
    pub output_path: String,
    pub output_exists: bool,
    pub skip_reason: Option<String>,
}

/// The plan Step 2 renders, returned by `preview_conversion`.
///
/// `plan_id` ties a later `execute_conversion` back to this exact preview; a
/// newer preview replaces it and the old id becomes stale (design D1).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConvertPlanDto {
    pub plan_id: String,
    /// The format actually used, including when the request left it to the
    /// configuration (design D6).
    pub target_format: ConvertFormatDto,
    pub keep_original: bool,
    pub items: Vec<ConvertItemDto>,
}

/// Where a batch is, as reported to Step 3 (design D5).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ConvertStage {
    Converting,
    /// The batch stopped, whether it finished or was cancelled. The report the
    /// command resolves with is what says which.
    Finished,
}

/// A progress message pushed over the execution `Channel`.
///
/// Per file, never finer: the crate converts a whole file in one call and
/// reports nothing from inside it, so a percentage would be invented.
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConvertProgress {
    pub stage: ConvertStage,
    /// 1-based position of `file_name` in the batch; equals `total` on `Finished`.
    pub index: u32,
    pub total: u32,
    pub file_name: String,
}

/// What became of one item in the batch.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ConversionStatusDto {
    Converted,
    Failed,
    /// Excluded by the plan (`skip_reason`) and refused by the executor.
    Skipped,
    /// Never started: the batch was cancelled before reaching it (design D5).
    Cancelled,
}

/// One item's outcome in the Step 3 report.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConversionOutcomeDto {
    pub input_name: String,
    pub output_path: String,
    pub status: ConversionStatusDto,
    /// Whether the write replaced a file that already existed (design D3).
    pub overwritten: bool,
    /// Whether the input was removed afterwards, i.e. keep-original was off and
    /// the removal succeeded (design D4).
    pub original_removed: bool,
    /// Why the item failed, localizable through the shared error path.
    pub error: Option<ErrorDto>,
    /// A non-fatal problem — today only "the conversion succeeded but the
    /// original could not be removed", which the CLI discards and the GUI must
    /// not, since it would otherwise misstate what is on disk (design D4).
    pub warning: Option<ErrorDto>,
}

/// The final report returned by `execute_conversion`.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct ConversionReportDto {
    pub outcomes: Vec<ConversionOutcomeDto>,
    pub success_count: u32,
    pub failure_count: u32,
    /// True when the user stopped the batch; the `Cancelled` outcomes are the
    /// items that were never started.
    pub cancelled: bool,
}

/// How the sync wizard obtains its offset.
///
/// The crate's `sync.default_method` has three values, but only `manual` is a
/// distinct *choice* here: `auto` and `vad` both route to the same local VAD
/// detection inside `SyncEngine`, so the wizard offers one automatic option.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum SyncMethodDto {
    Auto,
    Manual,
}

/// The shared configuration's sync settings, as Step 2 needs them (design D4).
///
/// Read-only: the sensitivity the user moves for one run is sent along with the
/// detect call and never written back to the configuration file.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncDefaultsDto {
    pub default_method: SyncMethodDto,
    /// `sync.vad.sensitivity` as a whole percentage `0..=100`, not the crate's
    /// `0.0..=1.0` `f32` — the same choice `MatchOperationDto::confidence`
    /// makes, and for one more reason here: specta exports an `f32` as
    /// `number | null`, because NaN and the infinities serialize as JSON null.
    /// That is honest about `f32`, and it is not a thing a sensitivity slider
    /// should have to handle. Lower is stricter.
    pub vad_sensitivity: u32,
    /// `sync.max_offset_seconds`, in milliseconds to match every other offset
    /// on this boundary (design D3).
    pub max_offset_ms: i32,
}

/// What one detection found, for the review step.
///
/// `offset_ms` is the crate's `f32` seconds rounded to whole milliseconds — the
/// precision subtitles actually carry, and an integer the editable field can
/// round-trip without float-formatting artifacts (design D3).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncDetectionDto {
    pub offset_ms: i32,
    /// A whole percentage `0..=100`, matching `MatchOperationDto::confidence`.
    /// Shown rather than thresholded on: blocking on a confidence value would
    /// invent product policy the crate makes no claim about.
    pub confidence: u32,
    /// Analysis warnings, coded rather than raw: the crate assembles English
    /// prose at runtime, so it travels as an `ErrorDto`'s `message` under the
    /// stable `sync.detection_warning` code the frontend localizes (design D7).
    pub warnings: Vec<ErrorDto>,
}

/// What applying the offset wrote.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct SyncApplyResultDto {
    pub output_path: String,
    /// Whether the write replaced a file that was already there — true only
    /// after the user confirmed the overwrite, since the command refuses
    /// otherwise (design D5).
    pub overwritten: bool,
}

/// Where a translation run writes its output (design Context, D4).
///
/// `Suffix` is the default: `<stem>.<target-language>.<ext>` beside the input
/// (beside the originating archive for extracted files). `Replace` writes the
/// input path itself and is refused for archive-extracted subtitles.
#[derive(Debug, Clone, Copy, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum TranslateOutputModeDto {
    Suffix,
    Replace,
}

/// One subtitle the Step 1 scan found, with the cost preview it exists for.
///
/// `unparsable` is the scan-time equivalent of the plan's
/// `translate.unparsable` skip reason: the file is listed rather than dropped,
/// but it contributes no cues and will not run.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TranslateScanItemDto {
    pub name: String,
    pub cue_count: u32,
    pub unparsable: bool,
}

/// What Step 1 renders, returned by `list_translate_inputs`.
///
/// Deliberately option-free: the scan exists so the wizard can show the size
/// of the coming AI job *before* the options step, and the target language —
/// which a plan cannot be resolved without — is only entered there. Folding
/// the scan into `preview_translation` would make Step 1 depend on a value the
/// user has no way to supply yet, dead-ending the wizard whenever
/// `translation.default_target_language` is unset.
///
/// `default_target_language` carries the configured default up to Step 2 so
/// that step can prefill its input without a plan having been built first.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TranslateScanResult {
    pub files: Vec<TranslateScanItemDto>,
    pub default_target_language: Option<String>,
}

/// The options a translation preview is computed from.
///
/// `target_language` is optional for the same reason `ConvertOptionsDto`'s
/// `target_format` is: a `null` resolves `translation.default_target_language`
/// from the shared configuration (design D5), and the resulting plan echoes
/// back what was used. `overwrite` is a plan-level toggle (design D4): off,
/// a suffix-mode item whose output already exists is excluded; on, it is
/// re-included. It has no effect in replace mode, which is gated by the
/// backup setting and the archive prohibition instead.
#[derive(Debug, Clone, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TranslateOptionsDto {
    pub target_language: Option<String>,
    pub source_language: Option<String>,
    pub context: Option<String>,
    /// `source = target` (or `source -> target`) lines, one per entry; parsed
    /// with the crate's public `parse_glossary_text()` at execution time.
    pub glossary_text: Option<String>,
    pub output_mode: TranslateOutputModeDto,
    pub overwrite: bool,
}

/// One planned translation, referenced by the frontend via `id` only.
///
/// `cue_count` gives Step 1 its cost preview before any AI request is sent.
/// `id` is the item's index in the backend-held plan. `skip_reason` carries a
/// stable code (`translate.unparsable`, `translate.replace_archive_forbidden`,
/// `translate.output_collision`, `translate.output_exists`) when the item
/// cannot run; such items are excluded from execution (design D1, D4).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TranslateItemDto {
    pub id: u32,
    pub input_name: String,
    pub input_path: String,
    pub output_path: String,
    pub cue_count: u32,
    pub output_exists: bool,
    pub skip_reason: Option<String>,
}

/// The plan Step 2 renders, returned by `preview_translation`.
///
/// `plan_id` ties a later `execute_translation` back to this exact preview; a
/// newer preview replaces it and the old id becomes stale (design D1).
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TranslatePlanDto {
    pub plan_id: String,
    /// The language actually used, including when the request left it to the
    /// configuration (design D5).
    pub target_language: String,
    pub output_mode: TranslateOutputModeDto,
    pub items: Vec<TranslateItemDto>,
}

/// Where a batch is, as reported to Step 3 (design D3).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum TranslateStage {
    Translating,
    /// The batch stopped, whether it finished or was cancelled. The report the
    /// command resolves with is what says which.
    Finished,
}

/// A progress message pushed over the execution `Channel`.
///
/// Per file, never finer: `translate_subtitle` reports nothing from inside
/// itself (progress prints go to stderr, invisible here), so a percentage
/// would be invented (design Non-Goals).
#[derive(Debug, Clone, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TranslateProgress {
    pub stage: TranslateStage,
    /// 1-based position of `file_name` in the batch; equals `total` on `Finished`.
    pub index: u32,
    pub total: u32,
    pub file_name: String,
}

/// What became of one item in the batch.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum TranslationStatusDto {
    Translated,
    Failed,
    /// Excluded by the plan (`skip_reason`) and refused by the executor.
    Skipped,
    /// Never started, or interrupted mid-translation: the batch was cancelled
    /// before this item finished (design D3).
    Cancelled,
}

/// One item's outcome in the Step 4 report.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TranslationOutcomeDto {
    pub input_name: String,
    pub output_path: String,
    pub status: TranslationStatusDto,
    /// Present only when replace mode created a backup copy before writing
    /// (design D2).
    pub backup_path: Option<String>,
    /// Why the item failed, localizable through the shared error path.
    pub error: Option<ErrorDto>,
    /// A non-fatal problem — today only the engine's empty-cue-fallback signal
    /// under `translate.empty_cue_fallback`, which the crate discards and the
    /// GUI must not, since it would otherwise misstate what the output holds
    /// (design D6).
    pub warning: Option<ErrorDto>,
}

/// The final report returned by `execute_translation`.
#[derive(Debug, Clone, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct TranslationReportDto {
    pub outcomes: Vec<TranslationOutcomeDto>,
    pub success_count: u32,
    pub failure_count: u32,
    /// True when the user stopped the batch; the `Cancelled` outcomes are the
    /// items that were never started or were interrupted mid-translation.
    pub cancelled: bool,
}
