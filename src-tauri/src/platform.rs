//! Platform-specific startup workarounds.
//!
//! These have to run before the webview is created, which means before
//! `tauri::Builder` does anything — i.e. from `main()`, the one function no
//! test can call. Keeping the decision in a pure function and the side effect
//! in a thin applier makes the decision testable.

/// Environment overrides this target needs before the webview starts.
///
/// Linux: works around WebKitGTK/NVIDIA Wayland compositing bugs (e.g. "Error
/// 71 dispatching to Wayland display") that otherwise crash the webview on
/// startup or resize. See <https://v2.tauri.app/develop/debug/linux-graphics/>
pub fn startup_env_overrides() -> Vec<(&'static str, &'static str)> {
    if cfg!(target_os = "linux") {
        vec![("__NV_DISABLE_EXPLICIT_SYNC", "1")]
    } else {
        Vec::new()
    }
}

/// Apply [`startup_env_overrides`] to the current process.
///
/// # Safety
///
/// Must be called from `main()` before any thread is spawned; `set_var` is not
/// thread-safe on Unix.
pub fn apply_startup_env() {
    for (key, value) in startup_env_overrides() {
        std::env::set_var(key, value);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    #[cfg(target_os = "linux")]
    fn linux_disables_nvidia_explicit_sync() {
        assert_eq!(
            startup_env_overrides(),
            vec![("__NV_DISABLE_EXPLICIT_SYNC", "1")]
        );
    }

    #[test]
    #[cfg(not(target_os = "linux"))]
    fn other_targets_need_no_overrides() {
        assert!(startup_env_overrides().is_empty());
    }

    #[test]
    fn the_applier_sets_every_override_in_the_process_environment() {
        apply_startup_env();
        for (key, value) in startup_env_overrides() {
            assert_eq!(
                std::env::var(key).ok().as_deref(),
                Some(value),
                "{key} was not applied to the process environment"
            );
        }
    }
}
