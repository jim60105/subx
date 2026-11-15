# settings-management Specification

## Purpose

The Settings screen through which the GUI reads and writes the configuration store shared with the `subx-cli` binary (AI provider, model, base URL, and API key) via the `subx-core` crate's `ConfigService`, validates writes with field-level errors, keeps the API key masked and write-only, offers an explicit AI connection test, and manages GUI-local language and theme preferences.

## Requirements

### Requirement: Settings screen edits the shared CLI configuration

The GUI SHALL provide a Settings screen, reachable from the app shell, that reads and writes the same configuration store the CLI uses (`~/.config/subx/config.toml`) exclusively through the `subx-core` crate's `ConfigService`. Editable fields SHALL include: AI provider, model, base URL, and API key. The offered providers SHALL be exactly those the crate's provider factory can construct: `openai`, `openrouter`, `azure-openai`, and `local`.

#### Scenario: CLI and GUI stay in sync

- **WHEN** the user changes the AI provider in the GUI and later runs `subx-cli config get ai.provider`
- **THEN** the CLI reports the value saved from the GUI

#### Scenario: External changes are picked up

- **WHEN** the configuration file changes outside the GUI and the user returns to the Settings screen
- **THEN** the screen shows the current on-disk values after its re-fetch

### Requirement: Validated writes with field-level errors

Configuration writes SHALL pass through the crate's validation. A rejected value SHALL NOT be persisted, and the GUI SHALL show a localized error attached to the offending field, keyed by a stable error code.

#### Scenario: Invalid value is rejected

- **WHEN** the user saves a base URL that fails crate validation
- **THEN** the value is not written, the base URL field shows a localized validation error, and other saved fields keep their new values

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

### Requirement: A failed configuration load does not block the settings form

When the initial configuration read fails, the Settings screen SHALL still render the editable AI form, pre-filled from the crate's tolerant read (on-disk values, or built-in defaults when no file exists), and SHALL present the failure as a non-blocking notice rather than replacing the form. When every per-field write succeeds, a failing post-save re-read SHALL NOT be reported as a save failure, and any previously shown save error SHALL be cleared.

#### Scenario: Form stays editable when the initial read fails

- **WHEN** the initial `get_config` call fails, for example on a fresh install where an environment-variable overlay produces a configuration that fails the crate's validation
- **THEN** the Settings screen shows the AI settings form pre-filled with the tolerant read's values (the built-in defaults on a fresh install) together with a visible, non-blocking error notice, and the user can edit any field and save

#### Scenario: A successful save is not masked by a failing re-read

- **WHEN** every per-field configuration write succeeds but the post-save `get_config` re-read fails
- **THEN** the screen does not show a save error, clears any previous save error, keeps the edited values in the form, and the values are present on disk

### Requirement: A tolerant configuration read supports settings repair

The GUI SHALL expose a `get_config_tolerant` Tauri command that returns the configuration through the crate's tolerant read: file-only values, no environment-variable overlay, and no cross-section validation. When the user configuration file does not exist (fresh install), the command SHALL return the crate's built-in default values; when the file exists, it SHALL return the on-disk values so the user can inspect and repair a configuration that fails the strict read.

#### Scenario: A fresh install reads defaults through the tolerant path

- **WHEN** no user configuration file exists and an environment variable (e.g. `OPENAI_BASE_URL` or `SUBX_AI_BASE_URL`) supplies a base URL that fails the strict validation
- **THEN** `get_config_tolerant` returns the built-in default configuration, and the Settings screen shows the form pre-filled with those defaults plus a non-blocking error notice

#### Scenario: An on-disk file can be inspected and repaired

- **WHEN** the user configuration file exists but the strict `get_config` fails (e.g. an environment-variable overlay breaks validation)
- **THEN** `get_config_tolerant` returns the on-disk configuration values, so the user can repair the file through the Settings screen

> **Known limitation:** the crate's config precedence gives environment variables (e.g. `OPENAI_BASE_URL`, `SUBX_AI_BASE_URL`) higher priority than the on-disk file. Repairing the on-disk file through the Settings screen therefore does not, by itself, override a conflicting environment variable — the strict gate and the AI connection test still see the environment value. Resolving the underlying bug for the user may require removing or correcting that environment variable (or a later change that alters the crate's precedence). This change keeps the form editable and repairable; it does not change the precedence rule.

### Requirement: Section headings state where values are stored

The AI section heading SHALL carry a label naming the shared configuration file its values are written to, and the preferences section heading SHALL carry a label stating that its values stay in this application. These labels SHALL replace the explanatory sentences under the headings.

#### Scenario: AI section names the shared configuration file

- **WHEN** the Settings screen renders
- **THEN** the AI section's heading row contains a storage label that includes the configuration file name

#### Scenario: Preferences section is labelled app-only

- **WHEN** the Settings screen renders
- **THEN** the preferences section's heading row contains the localized app-only storage label
