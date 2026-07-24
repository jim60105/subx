mod bindings;
mod commands;
mod dto;
mod error;
#[cfg(test)]
mod ipc_tests;
pub mod platform;
mod state;

use std::sync::Arc;

use subx_cli::config::ProductionConfigService;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Built once for the whole process: the crate service caches the loaded
    // configuration internally, so a second instance would see stale data.
    let config_service =
        ProductionConfigService::new().expect("failed to initialize the configuration service");

    // The one declaration of the IPC surface: it registers the handlers here and
    // emits the frontend's bindings in `bindings`' export test, so the two
    // cannot describe different command lists.
    let builder = bindings::specta_builder();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new(Arc::new(config_service)))
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            // No events exist yet; mounting the empty collection now is what
            // lets a later feature add one by declaring it.
            builder.mount_events(app);
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
