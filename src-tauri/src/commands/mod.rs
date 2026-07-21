//! Tauri command modules, one per feature area.
//!
//! Commands are a thin translation layer: convert DTOs, call `subx-cli` crate
//! APIs, emit progress events. No business logic lives here.

pub mod system;
