// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // Works around WebKitGTK/NVIDIA Wayland compositing bugs (e.g. "Error 71
    // dispatching to Wayland display") that otherwise crash the webview on
    // startup or resize. See https://v2.tauri.app/develop/debug/linux-graphics/
    #[cfg(target_os = "linux")]
    std::env::set_var("__NV_DISABLE_EXPLICIT_SYNC", "1");

    subx_lib::run()
}
