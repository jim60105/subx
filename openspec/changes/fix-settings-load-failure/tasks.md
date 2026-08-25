# Tasks: fix-settings-load-failure

## 1. Backend — tolerant configuration read command

- [ ] 1.1 Add the `get_config_tolerant` Tauri command to `src-tauri/src/commands/config.rs`: it calls the crate's tolerant `ConfigService::load_for_repair()` (file only, no env-var overlay, no cross-section validation) and returns the same masked `ConfigDto` as `get_config` (API key masked, write-only).
- [ ] 1.2 Register `get_config_tolerant` in the `COMMANDS` allowlist in `src-tauri/src/ipc_tests.rs` (20 → 21 commands) and add a command-boundary test that drives the command through the mock IPC runtime.
- [ ] 1.3 Add a `getConfigTolerant()` wrapper in `src/features/settings/settingsApi.ts` and regenerate `src/types/bindings.ts` with `npm run bindings:generate`.

## 2. GUI — settings form stays editable on load failure

- [ ] 2.1 In `src/features/settings/useSettingsForm.ts`, on an initial `getConfig()` rejection, call `getConfigTolerant()`: on success use its result as the working `config` (draft from it) and keep `loadError` set; on failure fall back to a `DEFAULT_CONFIG` constant mirroring the crate's `Config::default().ai` (provider `openai`, model `gpt-4.1-mini`, base URL `https://api.openai.com/v1`, no key).
- [ ] 2.2 Update `src/features/settings/SettingsScreen.tsx` so the AI form renders whenever `config` is non-null (including the tolerant result or the fallback), the `loadError` `ErrorNotice` renders above the form as a non-blocking banner, and the loading placeholder shows only while `config === null && loadError === undefined`.
- [ ] 2.3 Update `persist()` in `useSettingsForm.ts` so `saveError` is set only when a per-field write failed; when every field write succeeded, clear any previous `saveError` immediately (not after the post-save re-fetch) and preserve the user's draft even if the re-fetch fails.

## 3. Tests and spec traceability

- [ ] 3.1 Add frontend tests in `src/features/settings/SettingsScreen.test.tsx` (and/or a new `useSettingsForm.test.ts`): a failed initial load keeps the form editable with the tolerant read's values (defaults on a fresh install); a successful save is not masked by a failing re-read and clears any stale save error. Annotate with `// @covers settings-management/a-failed-configuration-load-does-not-block-the-settings-form#form-stays-editable-when-the-initial-read-fails` and `// @covers settings-management/a-failed-configuration-load-does-not-block-the-settings-form#a-successful-save-is-not-masked-by-a-failing-re-read`.
- [ ] 3.2 Add Rust tests in `src-tauri/src/commands/config.rs` for `get_config_tolerant`: with a `ProductionConfigService` pointed at a temp dir with no config file it returns the crate defaults (fresh install); with a valid on-disk file it returns the on-disk values with no env-var overlay. Annotate with `// @covers settings-management/a-tolerant-configuration-read-supports-settings-repair#a-fresh-install-reads-defaults-through-the-tolerant-path` and `// @covers settings-management/a-tolerant-configuration-read-supports-settings-repair#an-on-disk-file-can-be-inspected-and-repaired`.
- [ ] 3.3 Add a frontend unit test pinning the `DEFAULT_CONFIG` mirror: assert the full value set (provider `openai`, model `gpt-4.1-mini`, base URL `https://api.openai.com/v1`, `apiKeyMasked` empty, `apiKeySet` false) matches the crate's `Config::default().ai`, so the mirror cannot silently drift.

## 4. Crate-side diagnostics (subx-cli repo — small separate change)

- [ ] 4.1 In the subx-cli repo, add diagnostic logging to `ProductionConfigService::load_and_validate()` recording which configuration sources (default file, user file, environment variables) contributed to the merged configuration and the resolved config file path, so the origin of an `http://` base URL (user's shell environment, custom `SUBX_CONFIG_PATH`, or a bundled default file) is identifiable. The API key string must NOT be written to the logs: log which source set the key (e.g. "api_key came from the `OPENAI_API_KEY` environment variable") and, where a key value is logged at all, use the masked form (`mask_sensitive_value`); the raw key must never appear in any log line. Add a test asserting no log line contains the raw key.
- [ ] 4.2 Add a crate test pinning that a successful tolerant read (`load_for_repair`) never populates the strict-config cache, so an unvalidated config cannot reach `ComponentFactory::create_ai_provider()` (defense in depth around the HTTPS gate).
- [ ] 4.3 (Optional follow-up) If the diagnostic logging ships in a new `subx-cli` release, bump the version in `src-tauri/Cargo.toml` and `src-tauri/Cargo.lock`, then run `cargo test --manifest-path src-tauri/Cargo.toml`.

## 5. Spec sync and verification

- [ ] 5.1 Sync the `settings-management` delta spec into `openspec/specs/settings-management/spec.md` (via the openspec sync workflow) so the new requirements and scenarios are in the main spec and visible to the `spec:trace`/spec-coverage gates.
- [ ] 5.2 Run `npm run verify` (typecheck → frontend ≥85% coverage → Rust coverage → `spec:trace` → `bindings:check` → `icons:check`).
- [ ] 5.3 In the subx-cli repo, run `scripts/quality_check.sh` (fmt, clippy, nextest, docs) before publishing the crate release.
