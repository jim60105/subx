# Proposal: add-settings-page

## Why

The match wizard (and every future AI-backed feature) needs a configured AI provider. Requiring users to configure it through the CLI would break the GUI's promise of being self-sufficient. This change adds a settings page that reads and writes the same configuration the CLI uses, so users configure once and both frontends stay in sync.

**Depends on:** `add-tauri-app-shell` (shell navigation, ErrorDto convention, i18n, theming).

## What Changes

- Add Tauri commands `get_config`, `set_config_value`, and `test_ai_connection` in the thin command layer, delegating to the `subx-cli` crate's `ConfigService` (shared `~/.config/subx/config.toml`).
- API keys are returned masked (reusing the crate's masking module) and are write-only from the GUI: users can set or replace a key but never read the stored value back in cleartext.
- Add a Settings screen reachable from the app shell: AI provider selection (`openai` / `openrouter` / `azure-openai` / `local` — the four the crate's provider factory can actually build), model, base URL, API key entry, and a connection-test button with clear success/failure feedback.
- Setting values are validated by the crate's existing `ConfigService` validation; validation failures surface as localized field-level errors via the established `ErrorDto` code mapping.
- Add GUI preference controls (language, theme) to the same Settings screen, persisted in GUI-local storage per the shell's conventions — never written to the CLI config file.

## Capabilities

### New Capabilities

- `settings-management`: Viewing and editing the shared SubX configuration (AI provider, model, base URL, API key) from the GUI, including masked key handling, validation, connection testing, and GUI-local preferences (language, theme).

### Modified Capabilities

(none)

## Impact

- Backend: new `commands/config.rs`; `dto.rs` gains `ConfigDto`, `SetConfigRequest`, `ConnectionTestResult`; error mapping extended with configuration error codes.
- Frontend: new `features/settings/` screens and components; new locale namespace `settings` in `en` and `zh-TW`.
- Uses `subx-cli` crate APIs: `ConfigService` (get/set with validation), config masking utilities, and the AI provider factory for the connection test. No `subx-cli` changes.
- Unblocks `add-match-wizard`, which assumes a configurable AI provider.
