# Tasks: add-settings-page

## 1. Backend Commands

- [ ] 1.1 Create production `ConfigService` at startup and store it in Tauri managed state
- [ ] 1.2 Implement `get_config`: call `ConfigService::reload()` first (the production service caches in-process and never re-reads the file on its own), then return `ConfigDto` with the API key masked via the crate's masking utilities; never serialize the raw `Config` struct across IPC
- [ ] 1.3 Implement `set_config_value(key, value)` delegating to `ConfigService` validation; map validation failures to stable `ErrorDto` codes (e.g., `config.invalid_provider`, `config.invalid_url`)
- [ ] 1.4 Implement `test_ai_connection` building the provider via `ComponentFactory::create_ai_provider()` from saved config, returning `ConnectionTestResult { ok, latency_ms, error_code? }`
- [ ] 1.5 Backend tests with the crate's `TestConfigService`: masked reads, validated writes, error-code mapping; connection test against a `wiremock` endpoint (success and auth-failure)

## 2. Settings UI

- [ ] 2.1 Build the Settings screen layout (shell navigation entry + sections: AI configuration, GUI preferences) with TypeScript mirrors of the new DTOs
- [ ] 2.2 Implement the AI configuration form: provider select, model, base URL, replace-only API key field (empty by default, mask as placeholder), per-field inline validation errors
- [ ] 2.3 Implement save flow (per-key writes for changed fields, dependent fields first) and re-fetch on screen focus and after save
- [ ] 2.4 Implement the connection-test button with success (latency) and localized failure presentation
- [ ] 2.5 Add the GUI preferences section using the shell's shared `LanguageSelect` and `ThemeSelect` components (`src/components/`) with `variant="labeled"` — do not re-implement the pickers
- [ ] 2.6 Add `settings` locale namespace with complete `en` and `zh-TW` strings, including all new error codes

## 3. Tests & Verification

- [ ] 3.1 Component tests: masked key display, replace-only key behavior, field-level error rendering, save/partial-failure flow (IPC mocked)
- [ ] 3.2 Manual verification: edit config in GUI, confirm via `subx-cli config get`; edit via CLI, confirm GUI re-fetch shows it; run connection test against a local LLM (Ollama)
- [ ] 3.3 `cargo test`, `npm test`, `cargo clippy`, `tsc --noEmit` all clean
