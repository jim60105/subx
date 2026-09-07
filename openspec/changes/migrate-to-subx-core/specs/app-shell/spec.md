# app-shell — delta

## MODIFIED Requirements

### Requirement: Thin Tauri command-layer structure

The Rust backend SHALL be organized so Tauri commands contain no business logic: `commands/` modules translate DTOs, call `subx-core` crate APIs, and emit events; DTOs live in `dto.rs`; shared state in `state.rs`; error mapping in `error.rs`. All commands SHALL return `Result<T, ErrorDto>` where `ErrorDto` carries a stable machine-readable `code`, an English `message`, and an optional `hint_code`. The engine crate the backend depends on SHALL be `subx-core`, consumed from the published registry version; the `subx-cli` crate SHALL NOT appear in the backend's resolved dependency graph.

#### Scenario: Command failure yields a structured error

- **WHEN** any Tauri command fails
- **THEN** the frontend receives an `ErrorDto` with a stable `code` usable as a localization key, and the raw message available for detail display

#### Scenario: Crate access is confined to the command layer

- **WHEN** the engine-crate dependency is replaced by an equivalent crate exposing the same APIs
- **THEN** only `src-tauri` code (imports and `Cargo.toml`) requires changes; the frontend is unaffected, and no frontend file or repository-level guard needs to know which engine-crate name is current — the guards constrain that **no** engine-crate name (`subx-cli` or `subx-core`) appears outside `src-tauri` rather than pinning one spelling
