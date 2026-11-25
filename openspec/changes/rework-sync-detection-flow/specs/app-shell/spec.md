# Spec Delta

## MODIFIED Requirements

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
