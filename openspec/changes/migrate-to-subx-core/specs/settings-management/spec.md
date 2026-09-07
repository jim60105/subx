# settings-management — delta

## MODIFIED Requirements

### Requirement: Settings screen edits the shared CLI configuration

The GUI SHALL provide a Settings screen, reachable from the app shell, that reads and writes the same configuration store the CLI uses (`~/.config/subx/config.toml`) exclusively through the `subx-core` crate's `ConfigService`. Editable fields SHALL include: AI provider, model, base URL, and API key. The offered providers SHALL be exactly those the crate's provider factory can construct: `openai`, `openrouter`, `azure-openai`, and `local`.

#### Scenario: CLI and GUI stay in sync

- **WHEN** the user changes the AI provider in the GUI and later runs `subx-cli config get ai.provider`
- **THEN** the CLI reports the value saved from the GUI

#### Scenario: External changes are picked up

- **WHEN** the configuration file changes outside the GUI and the user returns to the Settings screen
- **THEN** the screen shows the current on-disk values after its re-fetch
