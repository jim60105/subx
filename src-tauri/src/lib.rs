mod commands;
mod dto;
mod error;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![commands::system::ping])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
