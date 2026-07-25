//! Tauri managed state.
//!
//! Canonical backend-owned data lives here. Feature changes extend this with
//! their own state (e.g. match plan storage); the frontend references entries
//! by identifier only.

use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
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
    convert_state: Arc<ConvertState>,
    sync_state: Arc<SyncState>,
}

impl AppState {
    pub fn new(config_service: Arc<dyn ConfigService>) -> Self {
        Self {
            config_service,
            match_state: Arc::new(MatchState::default()),
            convert_state: Arc::new(ConvertState::default()),
            sync_state: Arc::new(SyncState::default()),
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

    /// The convert wizard's backend-owned plan storage.
    pub fn convert_state(&self) -> Arc<ConvertState> {
        Arc::clone(&self.convert_state)
    }

    /// The sync wizard's single running-detection slot.
    pub fn sync_state(&self) -> Arc<SyncState> {
        Arc::clone(&self.sync_state)
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

/// Backend-owned convert wizard state: at most one plan, at most one execution.
///
/// Deliberately a copy of [`MatchState`]'s slot/epoch machinery rather than a
/// shared abstraction over it (design D1): the two differ in how they stop —
/// match aborts its task, convert asks the running batch to stop between files
/// so no output is ever half-written — and an abstraction over two users that
/// disagree on their central mechanism would have to leak both.
#[derive(Default)]
pub struct ConvertState {
    inner: Mutex<ConvertInner>,
}

#[derive(Default)]
struct ConvertInner {
    /// The single execution slot, reserved *before* the batch starts so a
    /// losing concurrent caller converts nothing.
    converting: bool,
    /// The running execution's cooperative stop flag (design D5). Unlike match,
    /// convert is never aborted mid-call: the in-flight file finishes, and the
    /// executor checks this before starting the next one.
    cancel: Option<Arc<AtomicBool>>,
    /// The single active plan, replaced by each successful preview.
    plan: Option<ConvertPlan>,
    /// Bumped by `cancel`, so a preview that was still resolving output paths
    /// when the user backed out does not install its plan afterwards.
    epoch: u64,
}

/// One planned conversion: where it reads from, where it will write, and why it
/// cannot run if it cannot.
pub struct ConvertPlanItem {
    pub input: PathBuf,
    pub output: PathBuf,
    /// Whether `output` already existed at preview time (design D3). A hint for
    /// the UI, not a lock — the filesystem may change before execution.
    pub output_exists: bool,
    /// Stable reason code when the item is excluded from execution
    /// (`convert.already_target_format`, `convert.output_collision`), else `None`.
    pub skip_reason: Option<String>,
}

/// A previewed conversion held for execution.
///
/// Owns the `CollectedFiles` so archive-extracted subtitles — which live in
/// temporary directories it holds — still exist when `execute_conversion` runs
/// (design D1). Execution takes ownership and holds it across every
/// `convert_file().await`; dropping the plan drops the extraction directories.
pub struct ConvertPlan {
    id: String,
    target_format: String,
    keep_original: bool,
    items: Vec<ConvertPlanItem>,
    collected: CollectedFiles,
}

impl ConvertPlan {
    pub fn new(
        target_format: String,
        keep_original: bool,
        items: Vec<ConvertPlanItem>,
        collected: CollectedFiles,
    ) -> Self {
        Self {
            id: format!("convert-{}", NEXT_PLAN_ID.fetch_add(1, Ordering::Relaxed)),
            target_format,
            keep_original,
            items,
            collected,
        }
    }

    pub fn id(&self) -> &str {
        &self.id
    }

    pub fn target_format(&self) -> &str {
        &self.target_format
    }

    pub fn keep_original(&self) -> bool {
        self.keep_original
    }

    /// Borrows the items, used to build the preview DTO before the plan moves
    /// into state.
    pub fn items(&self) -> &[ConvertPlanItem] {
        &self.items
    }

    /// Hands back the items **and** the `CollectedFiles`.
    ///
    /// The caller must keep the returned `CollectedFiles` alive across the
    /// execution `.await`s: an archive-sourced item reads from a path inside
    /// one, and dropping it early deletes the input before the conversion runs.
    pub fn into_execution(self) -> (Vec<ConvertPlanItem>, CollectedFiles) {
        (self.items, self.collected)
    }
}

impl ConvertState {
    /// The epoch a preview should pin itself to, read before it starts working.
    pub async fn current_epoch(&self) -> u64 {
        self.inner.lock().await.epoch
    }

    /// Stores the plan **only if** its epoch is still current — i.e. no `cancel`
    /// intervened while it was being built. Returns whether it was stored.
    pub async fn commit_plan(&self, epoch: u64, plan: ConvertPlan) -> bool {
        let mut inner = self.inner.lock().await;
        if inner.epoch == epoch {
            inner.plan = Some(plan);
            true
        } else {
            false
        }
    }

    /// Removes and returns the active plan if its id matches. A mismatch (or
    /// absence) means the plan is stale (design D1).
    pub async fn take_plan_if(&self, plan_id: &str) -> Option<ConvertPlan> {
        let mut inner = self.inner.lock().await;
        match &inner.plan {
            Some(plan) if plan.id == plan_id => inner.plan.take(),
            _ => None,
        }
    }

    /// Reserves the single execution slot, handing back the stop flag the batch
    /// must check before each file, or `Err` if a batch is already running.
    ///
    /// Reserving here — before any file is converted — is what guarantees a
    /// losing concurrent caller writes nothing at all (design D5).
    pub async fn try_begin_execution(&self) -> Result<Arc<AtomicBool>, ()> {
        let mut inner = self.inner.lock().await;
        if inner.converting {
            return Err(());
        }
        inner.converting = true;
        // A fresh flag per run: a cancel from a previous batch must not stop
        // this one before it converts anything.
        let flag = Arc::new(AtomicBool::new(false));
        inner.cancel = Some(Arc::clone(&flag));
        Ok(flag)
    }

    /// Releases the execution slot.
    pub async fn finish_execution(&self) {
        let mut inner = self.inner.lock().await;
        inner.converting = false;
        inner.cancel = None;
    }

    /// Asks a running batch to stop before its next file, discards the pending
    /// plan, and advances the epoch so an in-flight preview cannot install one.
    pub async fn cancel(&self) {
        let mut inner = self.inner.lock().await;
        if let Some(flag) = &inner.cancel {
            flag.store(true, Ordering::SeqCst);
        }
        inner.plan = None;
        inner.epoch = inner.epoch.wrapping_add(1);
    }

    /// Whether a batch currently holds the execution slot. Test-facing.
    #[cfg(test)]
    pub async fn is_running(&self) -> bool {
        self.inner.lock().await.converting
    }
}

/// Backend-owned sync wizard state: at most one running detection, nothing else.
///
/// Deliberately smaller than its two siblings, because the sync flow carries a
/// single number from detection to apply rather than a plan (design D1): there
/// is nothing to store, invalidate or take, so this holds only the guard. The
/// guard itself is [`MatchState`]'s — reserve before spawning, abort on cancel,
/// and refuse to hand back a result whose epoch a cancel has since bumped.
#[derive(Default)]
pub struct SyncState {
    inner: Mutex<SyncInner>,
}

#[derive(Default)]
struct SyncInner {
    /// The single detection slot, reserved *before* the task is spawned so a
    /// losing concurrent caller never decodes any audio.
    detecting: bool,
    /// The running detection's abort handle, set once the task is spawned.
    running: Option<AbortHandle>,
    /// Bumped by `cancel`. A detection that reserved epoch `E` may only return
    /// its result while the epoch is still `E`, so a cancel that lands while
    /// VAD is finishing discards the result instead of racing the UI.
    epoch: u64,
}

impl SyncState {
    /// Reserves the single detection slot, returning the current epoch, or
    /// `Err` if one is already reserved.
    pub async fn try_begin_detection(&self) -> Result<u64, ()> {
        let mut inner = self.inner.lock().await;
        if inner.detecting {
            return Err(());
        }
        inner.detecting = true;
        Ok(inner.epoch)
    }

    /// Records the spawned detection's abort handle, **or aborts the task** if
    /// a cancel already claimed its epoch.
    ///
    /// Reserving the slot and registering the handle cannot be one lock —
    /// `tokio::spawn` sits between them — so a `cancel_sync_detection` can land
    /// in the gap, find `running == None`, and abort nothing. The epoch is what
    /// makes that gap safe: a task whose epoch is gone is already abandoned, so
    /// it is aborted here rather than adopted. Adopting it would be worse than
    /// leaking it, because a *newer* detection may already own the slot and its
    /// handle would be silently replaced, leaving that run uncancellable.
    pub async fn set_running(&self, epoch: u64, handle: AbortHandle) {
        let mut inner = self.inner.lock().await;
        if inner.epoch == epoch {
            inner.running = Some(handle);
        } else {
            handle.abort();
        }
    }

    /// Releases the detection slot without publishing a result (error paths).
    ///
    /// Epoch-guarded for the same reason as [`Self::commit`]: an abandoned
    /// detection must not free a slot it no longer owns.
    pub async fn finish_detection(&self, epoch: u64) {
        let mut inner = self.inner.lock().await;
        if inner.epoch != epoch {
            return;
        }
        inner.detecting = false;
        inner.running = None;
    }

    /// Releases the slot and reports whether the result may still be shown —
    /// i.e. whether the epoch this detection reserved is still current.
    ///
    /// A stale epoch releases *nothing*. The slot it would otherwise clear may
    /// belong to a newer detection that started after the cancel, and clearing
    /// it would both discard that run's abort handle and let a third start
    /// alongside it.
    pub async fn commit(&self, epoch: u64) -> bool {
        let mut inner = self.inner.lock().await;
        if inner.epoch != epoch {
            return false;
        }
        inner.detecting = false;
        inner.running = None;
        true
    }

    /// Aborts any running detection and advances the epoch, so a result already
    /// past the abort point cannot be returned to a user who cancelled.
    ///
    /// The abort alone is not enough: `tokio::task::AbortHandle` takes effect at
    /// an `.await` point, and VAD's decode/inference loop is CPU-bound between
    /// them. The epoch is what makes the user-visible contract — a cancelled
    /// detection never surfaces a result — independent of when the task
    /// actually stops (design D2).
    pub async fn cancel(&self) {
        let mut inner = self.inner.lock().await;
        inner.detecting = false;
        if let Some(handle) = inner.running.take() {
            handle.abort();
        }
        inner.epoch = inner.epoch.wrapping_add(1);
    }

    /// Whether a detection is currently reserved or running. Test-facing.
    #[cfg(test)]
    pub async fn is_running(&self) -> bool {
        let inner = self.inner.lock().await;
        inner.detecting || inner.running.is_some()
    }
}

#[cfg(test)]
mod sync_state_tests {
    use super::*;

    #[tokio::test]
    async fn a_detection_that_was_not_cancelled_may_publish_its_result() {
        let state = SyncState::default();
        let epoch = state.try_begin_detection().await.unwrap();

        assert!(state.commit(epoch).await);
        assert!(!state.is_running().await, "commit releases the slot");
    }

    /// The cancel race: a cancel between VAD finishing and the command reading
    /// the result bumps the epoch, so the abandoned detection stays abandoned.
    #[tokio::test]
    async fn a_result_is_discarded_when_a_cancel_bumped_the_epoch() {
        let state = SyncState::default();
        let epoch = state.try_begin_detection().await.unwrap();
        state.cancel().await;

        assert!(!state.commit(epoch).await);
    }

    #[tokio::test]
    async fn a_reserved_slot_rejects_a_second_detection() {
        let state = SyncState::default();
        let epoch = state.try_begin_detection().await.unwrap();

        assert!(state.try_begin_detection().await.is_err());

        state.finish_detection(epoch).await;
        assert!(!state.is_running().await);
        assert!(state.try_begin_detection().await.is_ok());
    }

    #[tokio::test]
    async fn cancelling_aborts_the_running_task() {
        let state = SyncState::default();
        let epoch = state.try_begin_detection().await.unwrap();
        let task = tokio::spawn(std::future::pending::<()>());
        state.set_running(epoch, task.abort_handle()).await;

        state.cancel().await;

        assert!(task.await.unwrap_err().is_cancelled());
        assert!(!state.is_running().await);
    }

    /// The gap between reserving the slot and registering the handle: a cancel
    /// landing there has nothing to abort, so registration must abort the task
    /// itself rather than hand it a slot it no longer owns.
    #[tokio::test]
    async fn a_task_registered_after_its_cancel_is_aborted_not_adopted() {
        let state = SyncState::default();
        let epoch = state.try_begin_detection().await.unwrap();
        state.cancel().await;

        let task = tokio::spawn(std::future::pending::<()>());
        state.set_running(epoch, task.abort_handle()).await;

        assert!(task.await.unwrap_err().is_cancelled());
        assert!(
            !state.is_running().await,
            "an abandoned task must not occupy the slot"
        );
    }

    /// The other half: once a newer detection owns the slot, the abandoned one
    /// must not release it on the way out — doing so would discard the new
    /// run's abort handle and let a third detection start alongside it.
    #[tokio::test]
    async fn an_abandoned_detection_cannot_release_a_newer_ones_slot() {
        let state = SyncState::default();
        let abandoned = state.try_begin_detection().await.unwrap();
        state.cancel().await;

        let current = state.try_begin_detection().await.unwrap();
        let running = tokio::spawn(std::future::pending::<()>());
        state.set_running(current, running.abort_handle()).await;

        // Both of the abandoned run's exits, neither of which may touch the slot.
        assert!(!state.commit(abandoned).await);
        state.finish_detection(abandoned).await;

        assert!(state.is_running().await, "the newer detection still holds the slot");
        assert!(
            state.try_begin_detection().await.is_err(),
            "no third detection may start alongside it"
        );

        // And the newer run is still cancellable — its handle survived.
        state.cancel().await;
        assert!(running.await.unwrap_err().is_cancelled());
    }
}

#[cfg(test)]
mod convert_state_tests {
    use super::*;

    fn dummy_plan() -> ConvertPlan {
        ConvertPlan::new(
            "srt".to_string(),
            true,
            Vec::new(),
            CollectedFiles::new(Vec::new()),
        )
    }

    #[tokio::test]
    async fn a_committed_plan_is_retrievable_by_its_id() {
        let state = ConvertState::default();
        let epoch = state.current_epoch().await;
        let plan = dummy_plan();
        let id = plan.id().to_string();

        assert!(state.commit_plan(epoch, plan).await);
        assert!(state.take_plan_if(&id).await.is_some());
        assert!(
            state.take_plan_if(&id).await.is_none(),
            "a plan is executed once; taking it must leave the slot empty"
        );
    }

    /// The cancel race: a cancel between the preview finishing and the commit
    /// bumps the epoch, so the plan the user backed out of is never installed.
    #[tokio::test]
    async fn a_plan_is_discarded_when_a_cancel_bumped_the_epoch() {
        let state = ConvertState::default();
        let epoch = state.current_epoch().await;
        state.cancel().await;

        assert!(!state.commit_plan(epoch, dummy_plan()).await);
    }

    #[tokio::test]
    async fn a_reserved_slot_rejects_a_second_execution() {
        let state = ConvertState::default();
        let flag = state.try_begin_execution().await.expect("the first run reserves the slot");

        assert!(state.try_begin_execution().await.is_err());
        assert!(!flag.load(Ordering::SeqCst), "a fresh run starts uncancelled");

        state.finish_execution().await;
        assert!(!state.is_running().await);
        assert!(state.try_begin_execution().await.is_ok());
    }

    /// Cancelling sets the *running* batch's flag; a batch started afterwards
    /// gets a fresh one, or every later run would stop immediately.
    #[tokio::test]
    async fn cancel_stops_the_running_batch_but_not_the_next_one() {
        let state = ConvertState::default();
        let running = state.try_begin_execution().await.unwrap();

        state.cancel().await;
        assert!(running.load(Ordering::SeqCst));

        state.finish_execution().await;
        let next = state.try_begin_execution().await.unwrap();
        assert!(!next.load(Ordering::SeqCst));
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
