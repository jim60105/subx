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
