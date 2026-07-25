//! Tauri command modules, one per feature area.
//!
//! Commands are a thin translation layer: convert DTOs, call `subx-cli` crate
//! APIs, emit progress events. No business logic lives here.

pub mod config;
pub mod convert;
// `match` is a keyword; the file is `match.rs` and the module is `r#match`.
pub mod r#match;
pub mod system;
