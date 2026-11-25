## ADDED Requirements

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
