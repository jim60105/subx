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

#[cfg(test)]
mod tests {
    use super::*;
    use subx_cli::config::TestConfigService;

    /// Pins the "one service for the whole process" invariant the doc comment
    /// argues for: handing back a clone or a rebuilt service would silently
    /// reintroduce the stale-cache bug the single instance exists to avoid.
    #[test]
    fn the_state_hands_back_the_service_it_was_built_with() {
        let service = Arc::new(TestConfigService::with_ai_settings(
            "openai",
            "gpt-4.1-mini",
        ));
        let expected = Arc::as_ptr(&service) as *const ();

        let state = AppState::new(service.clone());

        assert_eq!(
            state.config_service() as *const dyn ConfigService as *const (),
            expected,
            "config_service() must return the very instance the state was constructed with"
        );
    }

    /// Two reads of the accessor observe the same value, so a command that
    /// writes and a later command that reads share one cache.
    #[test]
    fn every_caller_observes_the_same_configuration() {
        let service = TestConfigService::with_ai_settings("openai", "gpt-4.1-mini");
        let state = AppState::new(Arc::new(service));

        state
            .config_service()
            .set_config_value("ai.model", "gpt-4o-mini")
            .expect("write must succeed");

        assert_eq!(
            state
                .config_service()
                .get_config()
                .expect("read must succeed")
                .ai
                .model,
            "gpt-4o-mini"
        );
    }
}
