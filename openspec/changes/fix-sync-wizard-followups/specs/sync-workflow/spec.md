## ADDED Requirements

### Requirement: Starting detection keeps keyboard focus

When the detect step enters its detecting state, keyboard focus SHALL move to the cancel action if focus was on the control that started the detection. Focus SHALL NOT be left on a disabled or removed control.

#### Scenario: Start from the primary position

- **WHEN** start detection is the `next` action and the user focuses it and presses Enter
- **THEN** while detecting, the cancel action in `secondary` has keyboard focus

#### Scenario: Start from a secondary position

- **WHEN** the ask state is shown after a visit to the offset step, with start detection as the second `secondary` action, and the user focuses it and presses Enter
- **THEN** while detecting, the cancel action has keyboard focus

### Requirement: Leaving the wizard cancels a running detection

When the sync wizard is unmounted while a detection is running, the frontend SHALL ask the backend to cancel that detection, as the cancel action does, and SHALL ignore its result. The next detection, including one started from a newly mounted wizard, SHALL NOT be sent before that cancel request has settled. Unmounting with no detection running SHALL NOT send a cancel request.

#### Scenario: Navigating away mid-detection cancels the run

- **WHEN** a detection is running and the wizard is unmounted
- **THEN** exactly one cancel request is sent to the backend

#### Scenario: A new wizard waits for the previous cancel

- **WHEN** the wizard is unmounted mid-detection, its cancel request has not settled, and a newly mounted wizard starts a detection
- **THEN** no detection request is sent until the cancel settles, and then exactly one is sent

#### Scenario: Unmounting while idle sends nothing

- **WHEN** the wizard is unmounted on the detect step with no detection running
- **THEN** no cancel request is sent

### Requirement: Nudge controls' accessible names begin with their visible text

The decrease and increase nudge controls' accessible names SHALL begin with the control's visible text, in every shipped locale, to satisfy WCAG 2.5.3 (Label in Name).

#### Scenario: Names begin with the visible text in each locale

- **WHEN** the offset field renders in each supported language (English and Traditional Chinese)
- **THEN** for each nudge control, its accessible name starts with its rendered text content
