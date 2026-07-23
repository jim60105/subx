//! Serde DTOs crossing the Tauri IPC boundary.
//!
//! Every type here has a TypeScript mirror in `src/types/`. Canonical rich
//! Rust data stays in backend state (`state.rs`); the frontend only receives
//! display-oriented DTOs and sends back identifiers.

use serde::{Deserialize, Serialize};

use crate::error::ErrorDto;

/// Response of the `ping` reference command.
#[derive(Debug, Clone, Serialize)]
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
#[derive(Debug, Clone, Serialize)]
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
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConfigDto {
    pub ai: AiConfigDto,
}

/// A single `key = value` write against the shared configuration.
///
/// Writes are per-key, mirroring `subx-cli config set <key> <value>`; the
/// settings screen sends one request per changed field.
#[derive(Debug, Clone, Deserialize)]
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
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub ok: bool,
    /// Round-trip time of the probe request; present only on success.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub latency_ms: Option<u64>,
    /// Why the test failed; present only on failure.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<ErrorDto>,
}
