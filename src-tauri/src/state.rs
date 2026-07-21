//! Tauri managed state.
//!
//! Canonical backend-owned data lives here. Feature changes extend this with
//! their own state (e.g. match plan storage); the frontend references entries
//! by identifier only.

/// Application-wide managed state container.
///
/// Empty in the shell foundation; registered at startup so feature commands
/// can rely on it being present.
#[derive(Debug, Default)]
pub struct AppState {}
