# settings-management Specification

## Purpose

The Settings screen through which the GUI reads and writes the shared `subx-cli` configuration (AI provider, model, base URL, and API key) via the crate's `ConfigService`, validates writes with field-level errors, keeps the API key masked and write-only, offers an explicit AI connection test, and manages GUI-local language and theme preferences.

## Requirements

### Requirement: Settings screen edits the shared CLI configuration

The GUI SHALL provide a Settings screen, reachable from the app shell, that reads and writes the same configuration store the CLI uses (`~/.config/subx/config.toml`) exclusively through the `subx-cli` crate's `ConfigService`. Editable fields SHALL include: AI provider, model, base URL, and API key. The offered providers SHALL be exactly those the crate's provider factory can construct: `openai`, `openrouter`, `azure-openai`, and `local`.

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

### Requirement: A failed configuration load does not block the settings form

When the initial configuration read fails, the Settings screen SHALL still render the editable AI settings form, pre-filled with the values from the crate's tolerant configuration read (the on-disk values, or the crate's built-in default values when no configuration file exists), and SHALL present the read failure as a non-blocking error notice rather than replacing the form. When every per-field write succeeds, the screen SHALL NOT report a save failure if the post-save configuration re-read fails, and SHALL clear any previously shown save error.

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
