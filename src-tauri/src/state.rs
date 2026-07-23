//! Tauri managed state.
//!
//! Canonical backend-owned data lives here. Feature changes extend this with
//! their own state (e.g. match plan storage); the frontend references entries
//! by identifier only.

use std::sync::Arc;

use subx_cli::config::ConfigService;

/// Application-wide managed state container.
///
/// Registered at startup so feature commands can rely on it being present.
pub struct AppState {
    config_service: Arc<dyn ConfigService>,
}

impl AppState {
    pub fn new(config_service: Arc<dyn ConfigService>) -> Self {
        Self { config_service }
    }

    /// The single `subx-cli` configuration service shared by every command.
    ///
    /// One instance for the whole process: the crate service owns file
    /// locations, environment overlays, validation and atomic writes, and its
    /// in-process cache is only correct if nobody else holds a second one.
    pub fn config_service(&self) -> &dyn ConfigService {
        self.config_service.as_ref()
    }
}
