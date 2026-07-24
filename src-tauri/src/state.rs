//! Tauri managed state.
//!
//! Canonical backend-owned data lives here. Feature changes extend this with
//! their own state (e.g. match plan storage); the frontend references entries
//! by identifier only.

use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use subx_cli::cli::CollectedFiles;
use subx_cli::config::ConfigService;
use subx_cli::core::matcher::{MatchEngine, MatchOperation};
use tokio::sync::Mutex;
use tokio::task::AbortHandle;

/// Application-wide managed state container.
///
/// Registered at startup so feature commands can rely on it being present.
pub struct AppState {
    config_service: Arc<dyn ConfigService>,
    match_state: Arc<MatchState>,
}

impl AppState {
    pub fn new(config_service: Arc<dyn ConfigService>) -> Self {
        Self {
            config_service,
            match_state: Arc::new(MatchState::default()),
        }
    }

    /// The single `subx-cli` configuration service shared by every command.
    ///
    /// One instance for the whole process: the crate service owns file
    /// locations, environment overlays, validation and atomic writes, and its
    /// in-process cache is only correct if nobody else holds a second one.
    pub fn config_service(&self) -> &dyn ConfigService {
        self.config_service.as_ref()
    }

    /// A cloned handle to the shared config service.
    ///
    /// The match wizard's analysis runs in a spawned task that outlives the
    /// command's borrow of `State`, so it needs an owned `Arc` rather than a
    /// reference tied to the invocation.
    pub fn config_service_arc(&self) -> Arc<dyn ConfigService> {
        Arc::clone(&self.config_service)
    }

    /// The match wizard's backend-owned plan storage.
    pub fn match_state(&self) -> Arc<MatchState> {
        Arc::clone(&self.match_state)
    }
}

/// Monotonic source for plan IDs, unique for the life of the process.
///
/// A plan ID only has to distinguish a live plan from one a newer analysis
/// replaced (design D1); it is not a secret and never leaves the machine, so a
/// counter is enough and avoids pulling in a UUID dependency.
static NEXT_PLAN_ID: AtomicU64 = AtomicU64::new(1);

/// Backend-owned match wizard state: at most one plan, at most one analysis.
///
/// The mutex is `tokio::sync::Mutex` because writers hold it across `.await`
/// points — spawning the analysis task while holding it is what closes the
/// window in which a second `analyze_sources` could slip past the
/// single-analysis guard (design D3).
#[derive(Default)]
pub struct MatchState {
    inner: Mutex<MatchInner>,
}

#[derive(Default)]
struct MatchInner {
    /// The single analysis slot, reserved *before* the task is spawned so a
    /// losing concurrent caller never runs work (let alone an AI request).
    analyzing: bool,
    /// The running analysis's abort handle, set once the task is spawned.
    running: Option<AbortHandle>,
    /// The single active plan, replaced by each successful analysis.
    plan: Option<ActivePlan>,
    /// Bumped by `cancel`. The analysis that reserved epoch `E` only commits its
    /// plan if the epoch is still `E`, so a cancel during finalization discards
    /// the plan instead of racing `store`.
    epoch: u64,
}

/// A completed analysis held for review and execution.
///
/// Keeps the `MatchEngine` so execution reuses the very engine (and therefore
/// the very config and relocation mode) the plan was analyzed with, and owns
/// the `CollectedFiles` so archive-extracted subtitles — which live in
/// temporary directories it holds — still exist when `execute_selected` runs
/// (design D1). Execution takes ownership of `CollectedFiles` and holds it
/// across the copy; dropping the plan drops both.
pub struct ActivePlan {
    id: String,
    engine: MatchEngine,
    operations: Vec<MatchOperation>,
    /// Owns the archive-extraction temp dirs; handed to execution so an
    /// archive-sourced copy's source path survives until the copy completes.
    collected: CollectedFiles,
}

impl ActivePlan {
    pub fn new(
        engine: MatchEngine,
        operations: Vec<MatchOperation>,
        collected: CollectedFiles,
    ) -> Self {
        Self {
            id: format!("plan-{}", NEXT_PLAN_ID.fetch_add(1, Ordering::Relaxed)),
            engine,
            operations,
            collected,
        }
    }

    pub fn id(&self) -> &str {
        &self.id
    }
}

impl MatchState {
    /// Reserves the single analysis slot, returning the current epoch, or `Err`
    /// if one is already reserved.
    ///
    /// Reserving here — before the task is spawned — is what guarantees a losing
    /// concurrent caller does no work at all (design D3). The winner spawns and
    /// then records the abort handle via [`Self::set_running`].
    pub async fn try_begin_analysis(&self) -> Result<u64, ()> {
        let mut inner = self.inner.lock().await;
        if inner.analyzing {
            return Err(());
        }
        inner.analyzing = true;
        Ok(inner.epoch)
    }

    /// Records the spawned analysis's abort handle so `cancel` can abort it.
    pub async fn set_running(&self, handle: AbortHandle) {
        self.inner.lock().await.running = Some(handle);
    }

    /// Releases the analysis slot without storing a plan (error/panic paths).
    pub async fn finish_analysis(&self) {
        let mut inner = self.inner.lock().await;
        inner.analyzing = false;
        inner.running = None;
    }

    /// Releases the slot and stores the plan **only if** its epoch is still
    /// current — i.e. no `cancel` intervened during finalization. Returns
    /// whether the plan was stored.
    pub async fn commit_plan(&self, epoch: u64, plan: ActivePlan) -> bool {
        let mut inner = self.inner.lock().await;
        inner.analyzing = false;
        inner.running = None;
        if inner.epoch == epoch {
            inner.plan = Some(plan);
            true
        } else {
            false
        }
    }

    /// Aborts any running analysis, discards the pending plan, and advances the
    /// epoch so an in-flight analysis cannot commit its plan (design D3).
    pub async fn cancel(&self) {
        let mut inner = self.inner.lock().await;
        inner.analyzing = false;
        if let Some(handle) = inner.running.take() {
            handle.abort();
        }
        inner.plan = None;
        inner.epoch = inner.epoch.wrapping_add(1);
    }

    /// Stores a plan unconditionally. Test-facing shortcut for execution tests
    /// that never go through the analysis path.
    #[cfg(test)]
    pub async fn store_plan(&self, plan: ActivePlan) {
        self.inner.lock().await.plan = Some(plan);
    }

    /// Removes and returns the active plan if its id matches, leaving state
    /// empty. A mismatch (or absence) means the plan is stale (design D1).
    pub async fn take_plan_if(&self, plan_id: &str) -> Option<ActivePlan> {
        let mut inner = self.inner.lock().await;
        match &inner.plan {
            Some(plan) if plan.id == plan_id => inner.plan.take(),
            _ => None,
        }
    }

    /// Whether an analysis is currently reserved or running. Test-facing.
    #[cfg(test)]
    pub async fn is_running(&self) -> bool {
        let inner = self.inner.lock().await;
        inner.analyzing || inner.running.is_some()
    }
}

/// Consumes a plan for execution, exposing its engine and operations.
///
/// Kept as a method rather than public fields so the invariant "the engine and
/// operations came from one analysis" cannot be violated by constructing a
/// mismatched pair.
impl ActivePlan {
    /// Hands back the engine, operations, **and** the `CollectedFiles`.
    ///
    /// The caller must keep the returned `CollectedFiles` alive across the
    /// execution `.await`: it owns the archive-extraction temp dirs, and an
    /// archive-sourced operation copies from a path inside one. Dropping it
    /// early deletes the source before the copy runs.
    pub fn into_execution(self) -> (MatchEngine, Vec<MatchOperation>, CollectedFiles) {
        (self.engine, self.operations, self.collected)
    }

    /// Borrows the operations, used to build the review DTO before the plan is
    /// moved into state.
    pub fn operations(&self) -> &[MatchOperation] {
        &self.operations
    }
}

#[cfg(test)]
mod match_state_tests {
    use super::*;
    use subx_cli::config::TestConfigService;
    use subx_cli::core::matcher::MatchConfig;

    fn dummy_plan() -> ActivePlan {
        // A provider is required to build the engine, but nothing here runs it.
        let engine = MatchEngine::new(
            subx_cli::core::ComponentFactory::new(&TestConfigService::with_ai_settings_and_key(
                "openai",
                "gpt-4.1-mini",
                "sk-test-value-1234",
            ))
            .unwrap()
            .create_ai_provider()
            .unwrap(),
            MatchConfig {
                confidence_threshold: 0.5,
                max_sample_length: 1,
                enable_content_analysis: false,
                backup_enabled: false,
                relocation_mode: subx_cli::core::matcher::engine::FileRelocationMode::None,
                conflict_resolution: subx_cli::core::matcher::engine::ConflictResolution::AutoRename,
                ai_model: "m".to_string(),
                max_subtitle_bytes: 1,
            },
        );
        ActivePlan::new(engine, Vec::new(), CollectedFiles::new(Vec::new()))
    }

    #[tokio::test]
    async fn a_committed_plan_is_stored_when_its_epoch_is_current() {
        let state = MatchState::default();
        let epoch = state.try_begin_analysis().await.unwrap();
        let plan = dummy_plan();
        let id = plan.id().to_string();

        assert!(state.commit_plan(epoch, plan).await);
        assert!(state.take_plan_if(&id).await.is_some());
        assert!(!state.is_running().await, "commit releases the slot");
    }

    /// The core cancel-race fix: a cancel between the task finishing and the
    /// commit bumps the epoch, so the plan the user discarded is not stored.
    #[tokio::test]
    async fn a_plan_is_discarded_when_a_cancel_bumped_the_epoch() {
        let state = MatchState::default();
        let epoch = state.try_begin_analysis().await.unwrap();
        state.cancel().await; // bumps the epoch and clears the slot

        assert!(!state.commit_plan(epoch, dummy_plan()).await);
        assert!(state.take_plan_if("plan-anything").await.is_none());
    }

    #[tokio::test]
    async fn finish_releases_the_slot_without_storing() {
        let state = MatchState::default();
        state.try_begin_analysis().await.unwrap();
        state.set_running(tokio::spawn(std::future::pending::<()>()).abort_handle()).await;

        state.finish_analysis().await;

        assert!(!state.is_running().await);
    }

    #[tokio::test]
    async fn a_reserved_slot_rejects_a_second_reservation() {
        let state = MatchState::default();
        state.try_begin_analysis().await.unwrap();
        assert!(state.try_begin_analysis().await.is_err());
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
