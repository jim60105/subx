# app-shell Delta

## ADDED Requirements

### Requirement: Primary action can carry a status note

When a consuming feature attaches a status note to the `next` action, `WizardShell` SHALL render the note immediately before the primary control inside the inline-end cluster, as a polite live status exposing the accessible text the feature supplied. A note SHALL NOT be a control and SHALL NOT change the position of any of the three action slots. With no note attached the action bar SHALL render exactly as before.

#### Scenario: A note renders beside the primary action

- **WHEN** a step declares a `next` action with a status note
- **THEN** the note is rendered inside the inline-end cluster directly before the primary control, is not focusable, and exposes the supplied accessible text as a status

#### Scenario: No note leaves the action bar unchanged

- **WHEN** a step declares a `next` action without a status note
- **THEN** the inline-end cluster contains no status element
