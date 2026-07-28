## MODIFIED Requirements

### Requirement: Desktop application launches with the home task-entry hub

The application SHALL be a Tauri 2 desktop app with a React + TypeScript frontend using a **frameless window** (`"decorations": false`). On launch it SHALL display a home screen presenting the available task entries as cards: Match, Convert, Sync, and Translate.

**The four task cards SHALL be laid out as a fixed 2 × 2 grid — exactly two columns and two rows — at window widths of 40rem and above, collapsing to a single column only below that width. Cards SHALL stretch to a common height within their row so the grid reads as one balanced block regardless of description length.**

#### Scenario: First launch shows the hub

- **WHEN** the user launches the application
- **THEN** a desktop window opens **without a native title bar** showing the home screen with a Match card and Convert / Sync / Translate cards

#### Scenario: Unimplemented features are visibly disabled

- **WHEN** the home screen renders a task whose feature is not yet implemented
- **THEN** its card is shown in a disabled "coming soon" state and clicking it does not navigate

#### Scenario: Task cards form a two-by-two grid

- **WHEN** the home hub is displayed at a window width of 40rem or more
- **THEN** the task grid declares exactly two equal columns, placing the four cards in two rows of two, rather than reflowing to a three-plus-one arrangement

#### Scenario: Narrow window collapses to one column

- **WHEN** the home hub is displayed at a window width below 40rem
- **THEN** the task grid declares a single column and the four cards stack vertically

### Requirement: Navigation between home and feature screens

The shell SHALL provide client-side navigation from the home hub into a feature screen and back, without reloading the WebView.

**The header brand block (application name and tagline) SHALL be the shell's home affordance. On every screen other than the home hub it SHALL be a single interactive control that returns to the home hub — from any wizard step, whatever its progress, and from Settings — and SHALL carry a localized accessible name, taken from the `common` namespace, that **extends** its visible brand text rather than replacing it. On the home hub itself the brand SHALL render as non-interactive text with no button role.**

#### Scenario: Enter and leave a feature

- **WHEN** the user clicks an enabled task card and later clicks the header brand
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

### Requirement: Reusable WizardShell layout

The frontend SHALL provide a reusable `WizardShell` component that renders a numbered step indicator, a content slot for the active step, and **a persistent action bar** whose controls' labels and enabled state the consuming feature owns.

**The action bar SHALL be rendered on every step — including steps that declare no action at all — so that its presence and height never change from step to step. It SHALL live outside the scrollable step-content panel, so scrolling the step body never moves it.**

**The bar SHALL expose exactly three fixed-position slots: `back` at the inline start, and `secondary` followed by `next` in the inline-end cluster, with `next` rendered last — the inline-end-most, bottom-right control — and styled as the primary action. A slot left undeclared SHALL render nothing while leaving the remaining slots' positions unchanged.**

**Consuming features SHALL route every forward action through `next` — advancing a step, starting a batch, applying a result, retrying a failure, and finishing a run — and SHALL NOT render a forward action inside the content slot. Actions that are not forward motion (cancelling a running batch, escaping to Settings) belong in `secondary`.**

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

#### Scenario: Scrolling the step body does not move the primary action

- **WHEN** a step's content is taller than the content panel and the user scrolls it
- **THEN** the content scrolls inside the panel while the action bar and its primary control stay at the same on-screen position

### Requirement: AppHeader floating chrome and control layout

The application header (`AppHeader`) SHALL render header controls (**the interactive brand block that returns to the home hub**, language picker, theme picker, settings button, **and window control buttons**) with a unified control height of 36px. **The header SHALL NOT render a separate back button; the brand block is the only home affordance.** The header SHALL establish a primary stacking context (`z-index: 100`) and popover menus SHALL use `z-index: 1000` to ensure floating dropdown menus render above page main content and step indicators without clipping. Header buttons SHALL avoid nested `backdrop-filter` declarations inside the blurred header container to prevent WebKit GPU compositing layer bugs. **The header SHALL carry the `data-tauri-drag-region` attribute to enable window dragging on its empty space.**

#### Scenario: Preference dropdown popover floats above page content

- **WHEN** a feature screen with a step indicator or main panel is displayed and the user opens a header preference dropdown
- **THEN** the dropdown popover menu floats entirely above the wizard step indicator and content cards without being clipped or layered underneath

#### Scenario: Header controls share uniform height and remain visible during theme toggle

- **WHEN** the user switches language or theme in the header
- **THEN** all header controls maintain a uniform 36px height, and header buttons remain continuously visible without disappearing or requiring hover repaints

#### Scenario: Dragging the brand does not move the window

- **WHEN** a feature screen is open and the user presses and drags on the brand block
- **THEN** the brand behaves as a button and does not initiate a window drag

## ADDED Requirements

### Requirement: Uniform primary-action placement across feature screens

Every feature screen SHALL place its primary forward action at the same on-screen position — the inline end of the screen's action row, at the bottom of the layout — so that a user completing a task clicks in one place throughout. Wizard screens SHALL satisfy this through `WizardShell`'s action bar; non-wizard screens with a commit action SHALL align that action row to the inline end.

#### Scenario: Forward actions share one position in every wizard

- **WHEN** any of the Match, Convert, Sync, or Translate wizards is walked from its first step through its terminal report
- **THEN** every forward action along the way — continue, analyze, execute, start, apply, confirm, retry, finish — is rendered as the action bar's `next` control, and no step renders a forward action inside its content panel

#### Scenario: A running operation keeps the primary slot occupied

- **WHEN** a wizard step is running a batch or detection operation
- **THEN** the `next` control remains rendered in the same position and disabled, and where the feature offers a distinct cancel action it is rendered in `secondary` — so the primary position neither empties nor changes meaning mid-run

#### Scenario: Settings commits from the same side

- **WHEN** the Settings screen renders its save action
- **THEN** that action row is aligned to the inline end, matching the wizards' primary-action side
