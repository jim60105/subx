# app-shell Delta

## MODIFIED Requirements

### Requirement: Navigation between home and feature screens

The shell SHALL provide client-side navigation from the home hub into a feature screen and back, without reloading the WebView.

**The header SHALL show a breadcrumb: the application name followed, on every screen other than the home hub, by the current screen's localized title as plain text. The application name SHALL be the shell's home affordance. On every screen other than the home hub it SHALL be a single interactive control that returns to the home hub — from any wizard step, whatever its progress, and from Settings — and SHALL carry a localized accessible name, taken from the `common` namespace, that **extends** its visible brand text rather than replacing it. On the home hub itself the brand SHALL render as non-interactive text with no button role.**

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

### Requirement: AppHeader floating chrome and control layout

The application header (`AppHeader`) SHALL render header controls (**the breadcrumb whose application name returns to the home hub**, language picker, theme picker, settings control, **and window control buttons**) with a unified control height of 36px. **The header SHALL NOT render a separate back button; the breadcrumb's application name is the only home affordance.** The header SHALL establish a primary stacking context (`z-index: 100`) and popover menus SHALL use `z-index: 1000` to ensure floating dropdown menus render above page main content and step indicators without clipping. The header SHALL NOT declare `backdrop-filter`, on itself or on any control inside it. **The header SHALL carry the `data-tauri-drag-region` attribute to enable window dragging on its empty space.**

#### Scenario: Preference dropdown popover floats above page content

- **WHEN** a feature screen with a step indicator or main panel is displayed and the user opens a header preference dropdown
- **THEN** the dropdown popover menu floats entirely above the wizard step indicator and content without being clipped or layered underneath

#### Scenario: Header controls share uniform height and remain visible during theme toggle

- **WHEN** the user switches language or theme in the header
- **THEN** all header controls maintain a uniform 36px height, and header buttons remain continuously visible without disappearing or requiring hover repaints

#### Scenario: Dragging the brand does not move the window

- **WHEN** a feature screen is open and the user presses and drags on the brand block
- **THEN** the brand behaves as a button and does not initiate a window drag

## ADDED Requirements

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

## REMOVED Requirements

### Requirement: Desktop application launches with the home task-entry hub

**Reason**: The 2 × 2 card grid is replaced by a numbered list; its two grid-layout scenarios ("Task cards form a two-by-two grid", "Narrow window collapses to one column") describe a layout that no longer exists, and a MODIFIED block cannot drop scenarios.

**Migration**: Superseded by "Desktop application launches with the home task list", which keeps the "First launch shows the hub" and "Unimplemented features are visibly disabled" scenarios. Tests re-point their `@covers` annotations to the new requirement's IDs; the two grid tests in `src/styles/layout.test.ts` are deleted.
