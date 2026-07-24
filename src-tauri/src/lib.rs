mod commands;
mod dto;
mod error;
mod handlers;
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

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::new(Arc::new(config_service)))
        .invoke_handler(handlers::invoke_handler())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
