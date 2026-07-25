## MODIFIED Requirements

### Requirement: Desktop application launches with the home task-entry hub

The application SHALL be a Tauri 2 desktop app with a React + TypeScript frontend using a **frameless window** (`"decorations": false`). On launch it SHALL display a home screen presenting the available task entries as cards: Match, Convert, Sync, and Translate.

#### Scenario: First launch shows the hub

- **WHEN** the user launches the application
- **THEN** a desktop window opens **without a native title bar** showing the home screen with a Match card and Convert / Sync / Translate cards

#### Scenario: Unimplemented features are visibly disabled

- **WHEN** the home screen renders a task whose feature is not yet implemented
- **THEN** its card is shown in a disabled "coming soon" state and clicking it does not navigate

### Requirement: AppHeader floating chrome and control layout

The application header (`AppHeader`) SHALL render header controls (navigation back affordance, language picker, theme picker, settings button, **and window control buttons**) with a unified control height of 36px. The header SHALL establish a primary stacking context (`z-index: 100`) and popover menus SHALL use `z-index: 1000` to ensure floating dropdown menus render above page main content and step indicators without clipping. Header buttons SHALL avoid nested `backdrop-filter` declarations inside the blurred header container to prevent WebKit GPU compositing layer bugs. **The header SHALL carry the `data-tauri-drag-region` attribute to enable window dragging on its empty space.**

#### Scenario: Preference dropdown popover floats above page content

- **WHEN** a feature screen with a step indicator or main panel is displayed and the user opens a header preference dropdown
- **THEN** the dropdown popover menu floats entirely above the wizard step indicator and content cards without being clipped or layered underneath

#### Scenario: Header controls share uniform height and remain visible during theme toggle

- **WHEN** the user switches language or theme in the header
- **THEN** all header controls maintain a uniform 36px height, and header buttons remain continuously visible without disappearing or requiring hover repaints
