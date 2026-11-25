mod audio_fallback;
mod bindings;
mod build_info;
mod commands;
mod dto;
mod error;
#[cfg(test)]
mod ipc_tests;
mod media_server;
mod mp4_timing;
pub mod platform;
mod paths;
mod state;

use std::sync::Arc;

use subx_core::config::ProductionConfigService;
use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    println!(
        "{}",
        build_info::startup_log_line(
            env!("CARGO_PKG_VERSION"),
            build_info::git_hash(),
            cfg!(debug_assertions),
        )
    );

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
        // The match wizard's Step 1 "Browse" action opens a native file/folder
        // picker through this plugin.
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::new(Arc::new(config_service)))
        .invoke_handler(builder.invoke_handler())
        .setup(move |app| {
            // No events exist yet; mounting the empty collection now is what
            // lets a later feature add one by declaring it.
            builder.mount_events(app);
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            // `App::run` ends the process without dropping managed state, so
            // the preview's server and streams are stopped here explicitly.
            if let tauri::RunEvent::Exit = event {
                if let Some(state) = app.try_state::<AppState>() {
                    state.preview_state().shutdown();
                }
            }
        });
}
