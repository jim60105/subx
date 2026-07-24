//! The single command registration.
//!
//! Kept out of `lib.rs` (which is excluded from coverage as un-runnable
//! bootstrap) precisely because this part *is* testable: `ipc_tests` builds a
//! mock app from it, so it stays measured. There must be exactly one
//! `generate_handler!` in the crate — two lists that happen to agree is the
//! defect this exists to prevent, since the test suite would keep passing
//! against a command the real app never exposed.

/// The invoke handler the app and the tests both register.
pub fn invoke_handler<R: tauri::Runtime>() -> impl Fn(tauri::ipc::Invoke<R>) -> bool + Send + Sync {
    tauri::generate_handler![
        crate::commands::system::ping,
        crate::commands::config::get_config,
        crate::commands::config::set_config_value,
        crate::commands::config::test_ai_connection,
    ]
}
