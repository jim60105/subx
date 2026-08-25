# Proposal: fix-settings-load-failure

## Why

On a fresh install the user's environment (e.g. Flatpak) can carry an
environment variable such as `OPENAI_BASE_URL` or `SUBX_AI_BASE_URL`
pointing at an `http://` endpoint. For the default hosted provider
`openai`, the crate's "hosted providers require HTTPS" rule rejects the
merged configuration, so the strict `get_config` fails and the Settings
screen shows a single error notice ("設定不正確。請檢查 AI 設定後再試一次。")
that **replaces the entire AI settings form**. A brand-new user therefore
cannot edit or save any field — first use is fully blocked.

The fix keeps the strict read as the safety gate for AI work, and adds a
**tolerant configuration read** (the crate's existing `load_for_repair`
path: file only, no env-var overlay, no cross-section validation) exposed
as a new Tauri command, so the settings screen stays editable when the
strict read fails.

No backward compatibility or migration is needed: the project is unreleased
and has 0 users in the wild.

## What Changes

- **New Tauri command `get_config_tolerant`** in `src-tauri/src/commands/config.rs`:
  calls the crate's tolerant `ConfigService::load_for_repair()` and returns
  the same masked `ConfigDto` shape as `get_config` (API key masked,
  write-only). It is registered in the `COMMANDS` allowlist in
  `src-tauri/src/ipc_tests.rs`, and `src/types/bindings.ts` is regenerated
  with `npm run bindings:generate`.
- **GUI — `useSettingsForm.ts`**: when the initial `getConfig()` rejects,
  call `getConfigTolerant()`:
  - tolerant read succeeds → use its result (on-disk values, or the crate's
    defaults on a fresh install) as the working `config` and build the
    draft from it; `loadError` stays set so the localized error notice keeps
    showing.
  - tolerant read also fails (corrupted on-disk file) → fall back to a
    `DEFAULT_CONFIG` constant mirroring the crate's `Config::default().ai`.
- **GUI — `SettingsScreen.tsx`**: the AI form renders whenever `config` is
  non-null (including a fallback); the `ErrorNotice` for `loadError` is a
  non-blocking banner **above** the form instead of replacing it; the
  loading placeholder only shows while `config` is null and no load error
  exists.
- **GUI — `persist()` in `useSettingsForm.ts`**: `saveError` is set only
  when a per-field write fails. When every field write succeeds, a previous
  `saveError` is cleared immediately (not after the post-save re-fetch
  succeeds), and the edited draft is preserved even if the re-fetch fails.
- **Crate (subx-cli repo, small separate change)**: add diagnostic logging
  to `ProductionConfigService::load_and_validate()` recording which
  configuration sources (default file, user file, environment variables)
  contributed to the merged config and the resolved config file path, so an
  `http://` base URL's origin (e.g. a user's shell environment) is
  identifiable. The strict read's failure semantics are **preserved** —
  tolerant reads never enter the strict cache that drives AI work.
- **Dependency** (optional follow-up): if the diagnostic logging ships in a
  new `subx-cli` release, bump the version in `src-tauri/Cargo.toml`. The
  core fix builds on `subx-cli` 1.8, which already provides
  `load_for_repair`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `settings-management`: two new requirements — (1) a failed initial
  configuration read keeps the AI settings form editable (values from the
  tolerant read, or built-in defaults as fallback), with the error shown
  non-blockingly; a save whose per-field writes all succeeded is not
  reported as a failure and clears any stale save error; (2) a tolerant
  configuration read command (`get_config_tolerant`) returns the on-disk
  configuration without env-var overlay or cross-section validation, and
  returns the crate's defaults when no config file exists (fresh install).

## Impact

- Frontend: `src/features/settings/useSettingsForm.ts`,
  `src/features/settings/SettingsScreen.tsx`, `src/features/settings/settingsApi.ts`
  (new `getConfigTolerant()` wrapper), `src/types/bindings.ts` (regenerated),
  and the settings screen test files. New scenarios require
  `// @covers settings-management/<requirement>#<scenario>` annotations (or a
  justified waiver) per the repo's traceability rule.
- Backend: new command `get_config_tolerant` in
  `src-tauri/src/commands/config.rs`, allowlist registration in
  `src-tauri/src/ipc_tests.rs` (20 → 21 commands) plus a command-boundary
  test.
- Crate (subx-cli repo): diagnostic logging in `load_and_validate`; no
  change to strict-read semantics; tolerant path is isolated from the AI
  work path.
- Verification: `npm run verify` (typecheck, ≥85% coverage gates, `spec:trace`,
  `bindings:check`, `icons:check`) and the crate's `scripts/quality_check.sh`.
