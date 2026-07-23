# Design: add-settings-page

## Context

The app shell (`add-tauri-app-shell`) establishes the thin command layer, `ErrorDto` convention, theming, and i18n. This change adds the first real crate integration: configuration management against the shared `~/.config/subx/config.toml` through the `subx-cli` crate's `ConfigService`. The CLI validates this file strictly, so the GUI must go through the crate's own set/validate paths rather than editing TOML directly.

Relevant `subx-cli` APIs (consumed, not modified):

- `ConfigService` trait and production implementation (`src/config/service.rs`) — load, get, and set configuration values with validation.
- Masking utilities (`src/config/masking.rs`) — API-key display masking.
- `ComponentFactory::new(config_service)` / `create_ai_provider()` (`src/core/factory.rs`) — used to build a provider for the connection test.

## Goals / Non-Goals

**Goals:**

- Settings screen for the shared AI configuration: provider, model, base URL, API key; validated writes; connection test.
- Masked, write-only API key handling in the GUI.
- GUI preference controls (language, theme) colocated on the same screen.

**Non-Goals:**

- No editing of non-AI CLI config sections (sync/VAD tuning, parallel limits, formats) in this change; the screen structure leaves room for later sections.
- No credential storage of our own — the CLI config file remains the single store; OS keychain integration is a possible future enhancement, not v1.
- No environment-variable management (the crate already resolves env vars like `OPENAI_API_KEY` at load time).

## Decisions

### D1: All config access through `ConfigService`, one instance in managed state, reload-before-read

A single production `ConfigService` is created at app startup and stored in Tauri managed state; all three commands borrow it. Rationale: the crate service already handles file locations, env-var overlays, validation, and atomic writes — re-implementing any of it would duplicate CLI behavior and drift. Alternative (parsing the TOML in the GUI) rejected outright.

Important caveat: `ProductionConfigService::get_config()` caches the loaded `Config` in-process indefinitely and never re-reads the file on its own. The `get_config` command therefore MUST call `ConfigService::reload()` before reading, so the Settings screen's re-fetch actually observes external edits (CLI or manual) instead of returning the first-load snapshot forever.

### D2: API key is write-only from the GUI

`get_config` returns the key only in masked form (crate masking); there is no command that returns the cleartext key. `set_config_value` accepts a new key value. Rationale: the GUI never needs to display the cleartext, and keeping it unreadable narrows the exposure surface of the IPC boundary. Guard rail: `ConfigDto` must not contain a plaintext key field in any code path — every sensitive field is routed through the masking utilities when the DTO is assembled (never serialize the raw `Config` struct across IPC).

### D3: Connection test builds a real provider and performs a minimal call

`test_ai_connection` constructs the AI provider via `ComponentFactory::create_ai_provider()` from the currently saved config and performs the cheapest possible request (`AIProvider::chat_completion` with a single one-word user message); the result is returned as `ConnectionTestResult { ok, latency_ms?, error? }`. Rationale: testing the actual configured pipeline (including base URL and key resolution) is the only trustworthy signal, and it reuses the exact code path the match flow will use. The test runs against saved config — the UI saves values before testing — keeping the command stateless.

A rejected connection is a *result*, not a command failure, so the command returns `Ok(ConnectionTestResult { ok: false, .. })` rather than `Err`. The embedded `error` is a full `ErrorDto`, not a bare code, so the frontend renders it through the same `useLocalizedError` path as every other failure and gets the `hint_code` presentation for free.

The failure hint (`config.connection_test.hint`, "check the fields above") is applied only for failures those fields can actually fix — building the provider (`config`), the provider rejecting the request (`api`), or the service refusing it (`ai_service`, which also covers a rejected key). A transport-class failure in any other category keeps the crate's own hint, so a network blip is not misreported as a settings mistake. In practice a connection test almost always lands in one of those three categories, but the scoping keeps the advice honest for the cases that don't.

### D4: Field-level validation errors via `ErrorDto` codes

`set_config_value` maps crate validation failures to stable codes (e.g., `config.invalid_provider`, `config.invalid_url`) that the frontend renders as localized inline field errors. Unknown validation messages fall back to the generic error presentation defined by the shell's localization spec.

The code is derived from the **key being written**, not from the crate's English message: `SubXError::Config` carries free-form prose, and pattern-matching that prose would break on any upstream wording change. Since `set_config_value` is per-key (D5), the key alone identifies the offending field.

Crucially, the field code must be attached **only** when the value is genuinely at fault. The crate does *not* give us that for free: its `set_config_value` reports file-read failures, TOML-parse failures, a *different* already-invalid field found while reloading the file, and file-write failures **all as the same `SubXError::Config` variant** as a real value rejection — so matching the variant alone would tell a user their perfectly good base URL is invalid when the real problem is a full disk. The discriminator is therefore a **pre-validation** step: the command runs the crate's own public `validate_field(key, value)` (applying the same provider-alias normalization the write path uses) *before* calling `set_config_value`. A failure there is unambiguously this field's value → `config.invalid_*` with a field hint; anything `set_config_value` rejects afterwards is I/O, corruption or cross-section and keeps the honest generic `core.<category>` conversion.

### D5: Immediate persistence per field-group save, no draft state in backend

The settings form batches edits client-side and calls `set_config_value` per changed key on save. The backend stays stateless between calls. Rationale: matches `ConfigService`'s key-path API (`config set ai.provider …` in the CLI), avoids inventing a transactional layer; partial failure marks only the failed fields.

### D6: Language and theme controls reuse the shell's shared preference components

The GUI preferences section renders the shell's existing `LanguageSelect` and `ThemeSelect` components (`src/components/`, established in `add-tauri-app-shell` D8) with `variant="labeled"`, instead of building new pickers. Both components already own the correct wiring (i18next / the theme controller, `localStorage` persistence); this screen only supplies the labeled layout around them. Rationale: the header and this screen must never diverge on how these two preferences behave — a second, independent implementation would risk exactly that.

## Risks / Trade-offs

- [Concurrent edits: CLI or another process changes config.toml while the settings screen is open] → the screen re-fetches on focus and after every save; last-writer-wins is acceptable for a single-user desktop tool.
- [Connection test can incur a (tiny) paid API call on hosted providers] → the test is explicit user action only, never automatic; label copy makes it clear a request will be sent.
- [Per-key saves mean a multi-field change is not atomic] → field order is arranged so dependent fields (provider before model/base URL) are written first; a failed key leaves other saved fields valid — same semantics as sequential `subx-cli config set` calls, which users already accept.
- [Masked key display can confuse users into thinking the key is editable text] → the key field is a distinct "replace key" input that is empty by default with the mask shown as placeholder.
- [Read and write see different sources: `get_config()` overlays environment variables (`OPENAI_API_KEY`, …) while `set_config_value` deliberately loads file-only, so a key supplied purely by the environment shows as configured but is not in the file] → accepted, and matches the CLI's own behavior exactly; the GUI must not "helpfully" persist an env-provided secret into `config.toml`.
- [Concurrent config fetches racing each other: a slow focus refetch started before a save could resolve after the save's own refetch and revert the screen] → every config fetch (initial load, focus refetch, post-save refetch) shares a monotonic sequence guard and applies its result only if still the latest; the focus refetch is additionally skipped while a save or test is in flight. So the most recently *initiated* fetch always wins regardless of resolution order.
- [The replace-only key field cannot **clear** a stored key from the GUI — an empty draft means "keep the current key," so there is no in-GUI gesture to remove one] → deferred. The spec only requires the field be replace-only and empty by default (both satisfied), a leftover key is harmless (optional for `local`, overwritten otherwise), and a `touched`-flag approach risks accidental clears. Users who must remove a key use `subx-cli config` for now; an explicit "remove key" affordance is a clean future addition.
- [The connection test cannot be cancelled and can keep the button busy for a while] → accepted. The underlying HTTP client already applies the crate's `ai.request_timeout_seconds` bound (10–600s), so the wait is long-but-bounded, never indefinite; an explicit cancel is deferred unless it becomes an observed pain point.

## Migration Plan

Not applicable — additive feature on an unreleased app; no data migration (the config file format is owned by the CLI and unchanged).

## Open Questions

(none)
