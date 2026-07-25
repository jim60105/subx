# app-shell Specification

## Purpose

The desktop application frame: the Tauri 2 window, the home task-entry hub, client-side navigation between the hub and feature screens, the reusable multi-step `WizardShell` layout, and the thin Rust command layer through which the frontend reaches the `subx-cli` crate.

## Requirements

### Requirement: Desktop application launches with the home task-entry hub

The application SHALL be a Tauri 2 desktop app with a React + TypeScript frontend. On launch it SHALL display a home screen presenting the available task entries as cards: Match, Convert, Sync, and Translate.

#### Scenario: First launch shows the hub

- **WHEN** the user launches the application
- **THEN** a desktop window opens showing the home screen with a Match card and Convert / Sync / Translate cards

#### Scenario: Unimplemented features are visibly disabled

- **WHEN** the home screen renders a task whose feature is not yet implemented
- **THEN** its card is shown in a disabled "coming soon" state and clicking it does not navigate

### Requirement: Navigation between home and feature screens

The shell SHALL provide client-side navigation from the home hub into a feature screen and back, without reloading the WebView.

#### Scenario: Enter and leave a feature

- **WHEN** the user clicks an enabled task card and later uses the back affordance
- **THEN** the app navigates to that feature's screen and afterwards returns to the home hub, preserving home state

### Requirement: Reusable WizardShell layout

The frontend SHALL provide a reusable `WizardShell` component that renders a numbered step indicator, a content slot for the active step, and back/next navigation controls whose enabled state and labels are controlled by the consuming feature.

#### Scenario: Step indicator reflects progress

- **WHEN** a feature renders `WizardShell` with N steps and step k active
- **THEN** the indicator shows all N steps with steps before k marked completed, step k marked active, and later steps marked upcoming

#### Scenario: Navigation controls are feature-controlled

- **WHEN** the consuming feature declares the next action disabled
- **THEN** the next button renders disabled and clicking it has no effect

### Requirement: Thin Tauri command-layer structure

The Rust backend SHALL be organized so Tauri commands contain no business logic: `commands/` modules translate DTOs, call `subx-cli` crate APIs, and emit events; DTOs live in `dto.rs`; shared state in `state.rs`; error mapping in `error.rs`. All commands SHALL return `Result<T, ErrorDto>` where `ErrorDto` carries a stable machine-readable `code`, an English `message`, and an optional `hint_code`.

#### Scenario: Command failure yields a structured error

- **WHEN** any Tauri command fails
- **THEN** the frontend receives an `ErrorDto` with a stable `code` usable as a localization key, and the raw message available for detail display

#### Scenario: Crate access is confined to the command layer

- **WHEN** the `subx-cli` dependency is replaced by an equivalent crate exposing the same APIs
- **THEN** only `src-tauri` code (imports and `Cargo.toml`) requires changes; the frontend is unaffected

### Requirement: Application launches successfully under Wayland

The desktop application SHALL start and render its window when running under a Wayland session, including on NVIDIA GPU + Wayland configurations where WebKitGTK's DMABUF renderer is known to conflict with the NVIDIA driver.

#### Scenario: Launch on NVIDIA + Wayland

- **WHEN** the application is launched on Linux with `XDG_SESSION_TYPE=wayland` and an NVIDIA GPU driver
- **THEN** the window opens and renders without crashing with a Wayland protocol error (e.g. "Error 71 dispatching to Wayland display")

### Requirement: AppHeader floating chrome and control layout

The application header (`AppHeader`) SHALL render header controls (navigation back affordance, language picker, theme picker, and settings button) with a unified control height of 36px. The header SHALL establish a primary stacking context (`z-index: 100`) and popover menus SHALL use `z-index: 1000` to ensure floating dropdown menus render above page main content and step indicators without clipping. Header buttons SHALL avoid nested `backdrop-filter` declarations inside the blurred header container to prevent WebKit GPU compositing layer bugs.

#### Scenario: Preference dropdown popover floats above page content

- **WHEN** a feature screen with a step indicator or main panel is displayed and the user opens a header preference dropdown
- **THEN** the dropdown popover menu floats entirely above the wizard step indicator and content cards without being clipped or layered underneath

#### Scenario: Header controls share uniform height and remain visible during theme toggle

- **WHEN** the user switches language or theme in the header
- **THEN** all header controls maintain a uniform 36px height, and header buttons remain continuously visible without disappearing or requiring hover repaints

