// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Must happen before the webview is created; see `platform.rs` for what
    // each override works around.
    subx_lib::platform::apply_startup_env();

    subx_lib::run()
}
