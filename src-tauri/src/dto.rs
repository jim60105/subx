//! Serde DTOs crossing the Tauri IPC boundary.
//!
//! Every type here has a TypeScript mirror in `src/types/`. Canonical rich
//! Rust data stays in backend state (`state.rs`); the frontend only receives
//! display-oriented DTOs and sends back identifiers.

use serde::Serialize;

/// Response of the `ping` reference command.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PingResponse {
    /// Always `"pong"`.
    pub message: String,
    /// The GUI application version.
    pub app_version: String,
}
