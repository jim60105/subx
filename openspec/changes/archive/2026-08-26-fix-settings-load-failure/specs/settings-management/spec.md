## ADDED Requirements

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
