# settings-management Specification

## ADDED Requirements

### Requirement: Settings screen edits the shared CLI configuration

The GUI SHALL provide a Settings screen, reachable from the app shell, that reads and writes the same configuration store the CLI uses (`~/.config/subx/config.toml`) exclusively through the `subx-cli` crate's `ConfigService`. Editable fields SHALL include: AI provider (openai / openrouter / azure / local), model, base URL, and API key.

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

The GUI SHALL never display a stored API key in cleartext. Reads SHALL return the key masked (crate masking); the key input SHALL be a replace-only field that is empty by default.

#### Scenario: Masked display

- **WHEN** the Settings screen loads with an API key configured
- **THEN** the key appears only in masked form

#### Scenario: Replacing the key

- **WHEN** the user enters a new key and saves
- **THEN** the new key is persisted and subsequent reads show only its masked form

### Requirement: AI connection test

The Settings screen SHALL offer an explicit connection-test action that builds the AI provider from the currently saved configuration, performs a minimal real request, and reports success (with latency) or a localized failure reason. The test SHALL never run automatically.

#### Scenario: Successful test

- **WHEN** the user triggers the connection test with a working configuration
- **THEN** the UI reports success and the measured latency

#### Scenario: Failing test

- **WHEN** the user triggers the connection test with an invalid API key
- **THEN** the UI reports a localized failure explaining the key is rejected, with a hint pointing at the key field

### Requirement: GUI-local preferences on the same screen

The Settings screen SHALL include language (English / Traditional Chinese) and theme (light / dark / follow-system) controls. These preferences SHALL be persisted in GUI-local storage and SHALL NOT be written to the CLI configuration file.

#### Scenario: Preferences do not touch the CLI config

- **WHEN** the user changes language or theme
- **THEN** the CLI configuration file's content is unchanged
