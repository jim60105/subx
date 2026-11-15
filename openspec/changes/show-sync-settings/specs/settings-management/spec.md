# settings-management Delta

## MODIFIED Requirements

### Requirement: API key is masked and write-only

The GUI SHALL never display a stored API key in cleartext. Reads SHALL return the key masked (crate masking). When a key is configured the screen SHALL show its masked form with a replace action; the key input SHALL appear only after that action, or when no key is configured, and SHALL be a replace-only field that is empty by default.

#### Scenario: Masked display

- **WHEN** the Settings screen loads with an API key configured
- **THEN** the key appears only in masked form

#### Scenario: Replacing the key

- **WHEN** the user enters a new key and saves
- **THEN** the new key is persisted and subsequent reads show only its masked form

#### Scenario: Replace reveals an empty input

- **WHEN** a key is configured and the user activates the replace action
- **THEN** an empty key input appears and receives focus, and no cleartext or masked key is placed in it

#### Scenario: Keeping the current key discards the draft

- **WHEN** the user has activated replace, typed a draft, and then chooses to keep the current key
- **THEN** the input disappears, the masked key is shown again, and saving does not write an API key

#### Scenario: No configured key shows the input directly

- **WHEN** the Settings screen loads with no API key configured
- **THEN** the empty key input is shown without a replace action

### Requirement: AI connection test

The Settings screen SHALL offer an explicit connection-test action that builds the AI provider from the currently saved configuration, performs a minimal real request, and reports success (with latency) or a localized failure reason. The test SHALL never run automatically. A success SHALL be reported beside the action as a status with the measured latency, and the sentence explaining what the test does SHALL be the action's accessible description rather than visible text.

#### Scenario: Successful test

- **WHEN** the user triggers the connection test with a working configuration
- **THEN** the UI reports success and the measured latency

#### Scenario: Failing test

- **WHEN** the user triggers the connection test with an invalid API key
- **THEN** the UI reports a localized failure explaining the key is rejected, with a hint pointing at the key field

#### Scenario: Success is reported beside the action

- **WHEN** a connection test succeeds
- **THEN** a status element in the same row as the test action shows the latency, and the test action's accessible description is the explanatory sentence

### Requirement: GUI-local preferences on the same screen

The Settings screen SHALL include language (English / Traditional Chinese) and theme (light / dark / follow-system) controls. These preferences SHALL be persisted in GUI-local storage and SHALL NOT be written to the CLI configuration file. On this screen each control SHALL present all of its options inline as a single-choice group rather than as a dropdown.

#### Scenario: Preferences do not touch the CLI config

- **WHEN** the user changes language or theme
- **THEN** the CLI configuration file's content is unchanged

#### Scenario: Options are laid out inline

- **WHEN** the Settings screen renders
- **THEN** the language control and the theme control are each a labelled single-choice group with one option per supported value, the current value checked, and no popover to open

#### Scenario: Inline choice and title-bar dropdown stay in sync

- **WHEN** the user picks the dark theme in the Settings screen's inline group
- **THEN** the dark theme becomes active, the preference is stored under the GUI-local theme key, and the title-bar theme dropdown shows the same value

## ADDED Requirements

### Requirement: Section headings state where values are stored

The AI section heading SHALL carry a label naming the shared configuration file its values are written to, and the preferences section heading SHALL carry a label stating that its values stay in this application. These labels SHALL replace the explanatory sentences under the headings.

#### Scenario: AI section names the shared configuration file

- **WHEN** the Settings screen renders
- **THEN** the AI section's heading row contains a storage label that includes the configuration file name

#### Scenario: Preferences section is labelled app-only

- **WHEN** the Settings screen renders
- **THEN** the preferences section's heading row contains the localized app-only storage label
