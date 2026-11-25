# app-shell Specification

## Purpose

The desktop application frame: the Tauri 2 window, the home task-entry hub, client-side navigation between the hub and feature screens, the reusable multi-step `WizardShell` layout, and the thin Rust command layer through which the frontend reaches the `subx-core` crate.

## Requirements

### Requirement: Navigation between home and feature screens

The shell SHALL navigate client-side from the home hub into a feature screen and back without reloading the WebView. The header SHALL show a breadcrumb: the application name, then the current screen's localized title as plain text outside the hub. The name SHALL be the home affordance: on any other screen a single control returning to the hub, carrying a localized `common`-namespace accessible name that extends its visible text; on the hub, non-interactive text with no button role.

#### Scenario: Enter and leave a feature

- **WHEN** the user clicks an enabled task entry and later clicks the header brand
- **THEN** the app navigates to that feature's screen and afterwards returns to the home hub, preserving home state

#### Scenario: Brand returns home from a mid-flow wizard step

- **WHEN** the user has advanced a wizard past its first step and clicks the header brand
- **THEN** the app returns to the home hub immediately, and re-entering that feature starts a fresh wizard at its first step

#### Scenario: Brand returns home from Settings

- **WHEN** the Settings screen is open and the user clicks the header brand
- **THEN** the app returns to the home hub

#### Scenario: Brand is inert on the hub

- **WHEN** the home hub is displayed
- **THEN** the brand is plain text and exposes no button role, so there is no control whose only effect is to re-enter the screen already shown

#### Scenario: Breadcrumb names the current screen

- **WHEN** a feature screen or the Settings screen is open
- **THEN** the header shows that screen's localized title after the application name as non-interactive text, and on the home hub no title segment is shown

### Requirement: Reusable WizardShell layout

`WizardShell` SHALL be a reusable component rendering a numbered step indicator, a content slot, and a persistent action bar with feature-owned labels and states. The bar SHALL render on every step outside the scrollable panel, with fixed slots: `back` at the inline start, then `secondary` and `next` at the inline end, `next` last and primary; an undeclared slot SHALL leave the others in place. `secondary` SHALL hold one or two controls: non-forward or non-primary forward.

#### Scenario: Step indicator reflects progress

- **WHEN** a feature renders `WizardShell` with N steps and step k active
- **THEN** the indicator shows all N steps with steps before k marked completed, step k marked active, and later steps marked upcoming

#### Scenario: Navigation controls are feature-controlled

- **WHEN** the consuming feature declares the next action disabled
- **THEN** the next button renders disabled and clicking it has no effect

#### Scenario: Action bar persists across steps

- **WHEN** the user moves between a step that declares navigation actions and a step that declares none
- **THEN** the action bar is present in both cases and reserves the same height, so surrounding layout does not shift

#### Scenario: A lone back action stays at the inline start

- **WHEN** a step declares only `back`
- **THEN** the back control renders at the bar's inline start and the primary inline-end position is left empty, rather than the back control sliding to the inline end

#### Scenario: Secondary holds two controls

- **WHEN** a step declares two secondary actions and a next action
- **THEN** both render in declared order inside the inline-end cluster before `next`, which stays last

#### Scenario: Scrolling the step body does not move the primary action

- **WHEN** a step's content is taller than the content panel and the user scrolls it
- **THEN** the content scrolls inside the panel while the action bar and its primary control stay at the same on-screen position

### Requirement: Thin Tauri command-layer structure

The Rust backend SHALL keep business logic out of Tauri commands: `commands/` modules translate DTOs, call `subx-core` crate APIs, and emit events; DTOs live in `dto.rs`, shared state in `state.rs`, error mapping in `error.rs`. Every command SHALL return `Result<T, ErrorDto>`, whose `ErrorDto` carries a stable `code`, an English `message`, and an optional `hint_code`. The engine crate SHALL be `subx-core` from the published registry, with `subx-cli` absent from the resolved graph.

#### Scenario: Command failure yields a structured error

- **WHEN** any Tauri command fails
- **THEN** the frontend receives an `ErrorDto` with a stable `code` usable as a localization key, and the raw message available for detail display

#### Scenario: Crate access is confined to the command layer

- **WHEN** the engine-crate dependency is replaced by an equivalent crate exposing the same APIs
- **THEN** only `src-tauri` code (imports and `Cargo.toml`) requires changes; the frontend is unaffected, and no frontend file or repository-level guard needs to know which engine-crate name is current — the guards constrain that **no** engine-crate name (`subx-cli` or `subx-core`) appears outside `src-tauri` rather than pinning one spelling

### Requirement: Application launches successfully under Wayland

The desktop application SHALL start and render its window when running under a Wayland session, including on NVIDIA GPU + Wayland configurations where WebKitGTK's DMABUF renderer is known to conflict with the NVIDIA driver.

#### Scenario: Launch on NVIDIA + Wayland

- **WHEN** the application is launched on Linux with `XDG_SESSION_TYPE=wayland` and an NVIDIA GPU driver
- **THEN** the window opens and renders without crashing with a Wayland protocol error (e.g. "Error 71 dispatching to Wayland display")

### Requirement: AppHeader floating chrome and control layout

`AppHeader` SHALL render its controls — the breadcrumb whose name returns to the home hub, language picker, theme picker, settings control, and window buttons — at a uniform 36px height, and SHALL NOT render a separate back button. It SHALL NOT declare `backdrop-filter` on itself or any control inside it, or let the brand start a window drag. It SHALL establish a primary stacking context (`z-index: 100`) with popovers at `z-index: 1000`, and carry `data-tauri-drag-region` on empty space.

#### Scenario: Preference dropdown popover floats above page content

- **WHEN** a feature screen with a step indicator or main panel is displayed and the user opens a header preference dropdown
- **THEN** the dropdown popover menu floats entirely above the wizard step indicator and content without being clipped or layered underneath

#### Scenario: Header controls share uniform height and remain visible during theme toggle

- **WHEN** the user switches language or theme in the header
- **THEN** all header controls maintain a uniform 36px height, and header buttons remain continuously visible without disappearing or requiring hover repaints

#### Scenario: Dragging the brand does not move the window

- **WHEN** a feature screen is open and the user presses and drags on the brand block
- **THEN** the brand behaves as a button and does not initiate a window drag

### Requirement: Uniform primary-action placement across feature screens

Every feature screen SHALL place its primary forward action at the same on-screen position — the inline end of the screen's action row, at the bottom of the layout — so that a user completing a task clicks in one place throughout. Wizard screens SHALL satisfy this through `WizardShell`'s action bar; non-wizard screens with a commit action SHALL align that action row to the inline end.

#### Scenario: Forward actions share one position in every wizard

- **WHEN** any of the Match, Convert, Sync, or Translate wizards is walked from its first step through its terminal report
- **THEN** every primary forward action along the way — continue, analyze, execute, start, skip when primary, apply, confirm, retry, finish — is rendered as the action bar's `next` control, a step offering further forward choices renders the others in `secondary`, and no step renders a forward action inside its content panel

#### Scenario: A running operation keeps the primary slot occupied

- **WHEN** a wizard step is running a batch or detection operation
- **THEN** the `next` control remains rendered in the same position and disabled, and where the feature offers a distinct cancel action it is rendered in `secondary` — so the primary position neither empties nor changes meaning mid-run

#### Scenario: Settings commits from the same side

- **WHEN** the Settings screen renders its save action
- **THEN** that action row is aligned to the inline end, matching the wizards' primary-action side

### Requirement: Desktop application launches with the home task list

The application SHALL be a Tauri 2 desktop app with a React + TypeScript frontend using a frameless window. On launch it SHALL display a home screen listing the task entries Match, Convert, Sync, and Translate as one vertical numbered list. Each entry SHALL be a single control spanning its row that shows an ordinal, the task name, and a specimen demonstrating the task; assistive technology SHALL receive the task's description instead of the specimen.

#### Scenario: First launch shows the hub

- **WHEN** the user launches the application
- **THEN** a desktop window opens without a native title bar showing the home screen with a Match entry and Convert / Sync / Translate entries

#### Scenario: Unimplemented features are visibly disabled

- **WHEN** the home screen renders a task whose feature is not yet implemented
- **THEN** its entry is shown in a disabled "coming soon" state and clicking it does not navigate

#### Scenario: Tasks form one numbered list

- **WHEN** the home hub is displayed
- **THEN** the four tasks appear as the items of a single ordered list in the order Match, Convert, Sync, Translate, and each item contains exactly one control whose accessible name is the task name

#### Scenario: Each entry demonstrates its task with a specimen

- **WHEN** the home hub is displayed
- **THEN** every entry contains a specimen that is excluded from the accessibility tree, and the entry's accessible description is the task's localized description

### Requirement: Step indicator shows two-digit ordinals and hides the step counter

The `WizardShell` step indicator SHALL label every step with a two-digit ordinal and its name in every state, and SHALL NOT replace a completed step's ordinal with another mark. The "step k of N" sentence SHALL remain in the document for assistive technology and SHALL NOT be displayed.

#### Scenario: Ordinals stay visible in every state

- **WHEN** a wizard renders with a completed step, the active step, and an upcoming step
- **THEN** each of them shows its own two-digit ordinal, starting at `01`, beside its name

#### Scenario: Step counter is announced but not shown

- **WHEN** a wizard renders step k of N
- **THEN** the localized "step k of N" text is present in the document inside an element that is visually hidden

### Requirement: Primary action can carry a status note

When a consuming feature attaches a status note to the `next` action, `WizardShell` SHALL render the note immediately before the primary control inside the inline-end cluster, as a polite live status exposing the accessible text the feature supplied. A note SHALL NOT be a control and SHALL NOT change the position of any of the three action slots. With no note attached the action bar SHALL render exactly as before.

#### Scenario: A note renders beside the primary action

- **WHEN** a step declares a `next` action with a status note
- **THEN** the note is rendered inside the inline-end cluster directly before the primary control, is not focusable, and exposes the supplied accessible text as a status

#### Scenario: No note leaves the action bar unchanged

- **WHEN** a step declares a `next` action without a status note
- **THEN** the inline-end cluster contains no status element

### Requirement: Secondary action can take keyboard focus

A consuming feature MAY mark a `secondary` action as taking focus. When an action becomes marked, either on the first render or after a render where it was not marked, `WizardShell` SHALL move keyboard focus to that control if focus is on the document body or inside the action bar. Focus elsewhere SHALL stay where it is, and an action that stays marked SHALL NOT take focus again on later renders. The mark SHALL NOT change any slot's position.

#### Scenario: Focus moves from a control that became disabled

- **WHEN** focus is on the `next` control and the feature re-renders with `next` disabled and a `secondary` action marked to take focus
- **THEN** that secondary control has keyboard focus

#### Scenario: Focus moves when the focused control is removed

- **WHEN** focus is on a second `secondary` control and the feature re-renders with only one `secondary` action, marked to take focus
- **THEN** the remaining secondary control has keyboard focus

#### Scenario: Focus outside the action bar is not taken

- **WHEN** focus is on an input in the content panel and the feature re-renders with a `secondary` action marked to take focus
- **THEN** focus stays on that input

#### Scenario: A mark that stays does not take focus again

- **WHEN** a marked `secondary` control has taken focus, the user moves focus to the `back` control, and the feature re-renders with the same action still marked
- **THEN** focus stays on the `back` control
