# Design: fix-settings-load-failure

## Context

The Settings screen reads the shared `subx-cli` configuration through the
`get_config` Tauri command, which calls `ProductionConfigService::reload()`
(strict load: defaults + user file + env-var overlay + cross-section
validation). On a fresh install there is no `~/.config/subx/config.toml`;
if the user's environment exports an OpenAI-compatible `http://` endpoint
via `OPENAI_BASE_URL` or `SUBX_AI_BASE_URL`, the crate's "hosted providers
require HTTPS" rule rejects the merged configuration, and `get_config`
returns `core.config` ("設定不正確。請檢查 AI 設定後再試一次。").

The frontend `useSettingsForm` keeps `config` as `null` after a failed
initial load, and `SettingsScreen` renders **either** the error notice
**or** the form — so the form disappears entirely and a new user cannot
edit or save anything.

The fix keeps the strict read as the safety gate for AI work and adds a
tolerant read for the settings-repair path, so the form stays editable.

The project is unreleased (0 users), so no compatibility constraints apply.

## Goals / Non-Goals

**Goals:**

- A failed initial config read leaves the AI settings form fully editable,
  pre-filled with values from the tolerant read (on-disk values, or the
  crate's built-in defaults on a fresh install).
- A save whose per-field writes all succeeded is not reported as a failure
  when the post-save re-read fails, and any stale save error is cleared.
- A new `get_config_tolerant` command exposes the crate's tolerant
  `load_for_repair` path (file only, no env-var overlay, no
  cross-section validation).

**Non-Goals:**

- No change to the strict `get_config` failure semantics: a failed strict
  read still means the configuration driving AI work is unvalidated, and
  the AI provider construction keeps its HTTPS gate as defense in depth.
- No migration or backward-compatibility work (unreleased, 0 users).
- No change to how the connection test behaves (it already reports a config
  failure as a non-fatal result).
- No new capabilities; the existing `settings-management` spec gains two
  requirements.

## Decisions

### D1: Tolerant read as the primary fallback; hardcoded defaults as the last resort

In `src/features/settings/useSettingsForm.ts`, a strict `getConfig()`
rejection triggers the tolerant fallback. The fallback is **shared** by any
strict failure while `config === null` — the initial load and any
focus-refetch that lands while no config has ever been read — so a failed
focus-refetch can never leave the screen with `config === null` and only an
error banner (the "stuck on load failure" state the bug report describes).

```ts
const runTolerantFallback = (error: unknown, seq: number) => {
  getConfigTolerant().then(
    (tolerant) => {
      if (seq !== loadSeqRef.current) return;
      setConfig(tolerant);
      setDraft(draftFrom(tolerant));
      setLoadError(error);
    },
    () => {
      if (seq !== loadSeqRef.current) return;
      setConfig(DEFAULT_CONFIG); // crate defaults mirror, last resort
      setDraft(draftFrom(DEFAULT_CONFIG));
      setLoadError(error);
    },
  );
};

// In the initial-load effect:
(error) => {
  if (cancelled || seq !== loadSeqRef.current) return;
  if (isInitial || configRef.current === null) runTolerantFallback(error, seq);
}
```

A `bootstrappingRef` is set while the initial load is in flight and cleared
when it settles (success or fallback complete). The window-focus refetch is
skipped while bootstrapping, so a focus event cannot bump `loadSeqRef` and
orphan the in-flight tolerant call (review finding: a focus refetch that
starts mid-bootstrap would invalidate the fallback and leave `config` null).
A `configRef` mirrors the latest `config` for the fallback's trigger check.

`DEFAULT_CONFIG` mirrors `subx_cli::config::Config::default().ai`:

```ts
const DEFAULT_CONFIG: ConfigDto = {
  ai: {
    provider: "openai",
    model: "gpt-4.1-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKeyMasked: "",
    apiKeySet: false,
  },
};
```

**Rationale:** the tolerant read returns the on-disk values when a file
exists (so a corrupted-file case shows what is actually on disk) and the
crate's defaults when no file exists (fresh install). The hardcoded
`DEFAULT_CONFIG` is only reached when the tolerant read itself fails (e.g.
the on-disk file is not valid TOML). A frontend unit test pins the mirror
against the crate defaults.

**Alternative considered:** keep `config` null and special-case null inside
`persist()` and `isFieldDirty`. Rejected: it scatters null checks across
the dirty/save/draft paths; a concrete fallback keeps the existing logic
intact.

### D2: Render the form whenever `config` is non-null; error notice stays visible

In `SettingsScreen.tsx`:

- `config === null && loadError === undefined` → show the "loading" line.
- Otherwise (config is non-null, including the tolerant result or the
  fallback) → render `AiSettingsSection`, the save action row, and the
  connection test panel.
- `loadError !== undefined` → render `<ErrorNotice error={loadError} />`
  **above** the form as a non-blocking banner.

**Rationale:** the notice must not replace the form; the user's complaint
is precisely that the notice swallowed the form.

### D3: `persist()` — separate write failures from re-fetch failures

`persist()` currently treats any failed post-save `getConfig()` re-fetch as
a `saveError`. Revised rules (per review):

- `saveError` denotes a **non-field action error**. Per-field failures are
  surfaced through `fieldErrors` only.
- When every field write succeeds, clear any previous `saveError`
  **immediately after the write loop** — do not wait for the re-fetch.
- When all writes succeeded but the strict re-fetch failed, refresh `config`
  through the **tolerant read** (`getConfigTolerant()`), merging the draft
  with the same keep-rule (`errors[field] !== undefined`) so saved fields —
  including the API key, which resets to its masked placeholder — stop
  showing as dirty. If the tolerant read also fails, keep the current
  `config` and preserve the user's draft.
- When some field write failed, a failed re-fetch sets `saveError` (the
  non-field action error) alongside the field errors.

**Rationale:** the write path in the crate (`set_config_value`) uses the
tolerant file-only load and validates the post-mutation configuration, so
a field write can land on disk even when the strict overlay-merged read
fails. Refreshing from the tolerant read after a successful save keeps the
screen consistent with what is on disk; reporting a save failure (or
leaving a stale save error) in that case would mislead the user.

### D4: New Tauri command `get_config_tolerant`

In `src-tauri/src/commands/config.rs`, add a `get_config_tolerant` command:

```rust
#[tauri::command]
#[specta::specta]
pub fn get_config_tolerant(state: State<AppState>) -> Result<ConfigDto, ErrorDto> {
    read_config_tolerant(state.config_service())
}
```

where `read_config_tolerant` calls `service.load_for_repair()` (the
crate's tolerant path: file only, no env-var overlay, no cross-section
validation) and builds the same masked `ConfigDto` as `read_config` (API
key masked via `mask_sensitive_value`, `apiKeySet` flag).

The crate's `ConfigService` trait already exposes `load_for_repair` in
`subx-cli` 1.8 — no dependency bump is required for the core fix.

- Register `get_config_tolerant` in the `COMMANDS` allowlist in
  `src-tauri/src/ipc_tests.rs` (20 → 21 commands) and add a
  command-boundary test driving it through the mock IPC runtime.
- Regenerate `src/types/bindings.ts` with `npm run bindings:generate`.

**Rationale:** a separate tolerant command keeps the strict `get_config`
safety gate intact for AI work (the tolerant value never enters the
strict cache), and gives the settings screen a read path that cannot be
broken by env-var overlays — the "readable/diagnostic config" path the
review called for.

### D5: Crate — diagnostic logging only (subx-cli repo, small change)

In `subx-cli`'s `ProductionConfigService::load_and_validate()`, add
diagnostic logging that records which configuration sources (default file,
user file, environment variables) contributed to the merged configuration
and the resolved config file path. This makes it possible to identify where
an `http://` base URL comes from on a fresh install (user's shell
environment, a custom `SUBX_CONFIG_PATH`, or a bundled default file).

**Secrets must not reach the logs:** the API key is a sensitive value, so
the diagnostic log lines record only the *sources* that set each `ai.*`
field (e.g. "base_url came from the `OPENAI_BASE_URL` environment
variable"), the config file path, and — where a key value is mentioned at
all — its masked form via the crate's `mask_sensitive_value()`. The raw key
string SHALL NOT appear in any log output.

**Strict-read semantics are preserved:** a failed strict load still fails
`get_config`, and AI provider construction keeps the HTTPS gate as defense
in depth. The tolerant path stays isolated from the AI work path.

## Risks / Trade-offs

- **Mirror drift** — the GUI `DEFAULT_CONFIG` is a hand-maintained mirror of
  the crate defaults. → Mitigation: a frontend unit test asserts the full
  `DEFAULT_CONFIG` value set (provider `openai`, model `gpt-4.1-mini`, base
  URL `https://api.openai.com/v1`, no key) against the crate defaults.
- **Env-var overlay still invalid after a save** — the user can repair the
  on-disk file (e.g. switch provider to `local`, which accepts `http://`
  URLs), but `OPENAI_BASE_URL=http://...` keeps overriding the file on
  every strict `reload()` until the env var itself is fixed. This is
  acceptable: the form stays editable (D2), the banner stays visible, and
  per-field writes still land on disk (D3).
- **Connection test** — `probe_ai_connection` calls `service.reload()`
  (strict); when the strict load still fails it reports a `core.config`
  failure result (existing behavior). No change needed in this repo.
- **Tolerant value leaking into AI work** — the crate already guarantees
  that successful `load_for_repair` invocations do not populate the
  strict-config cache; a crate test pins that an unvalidated config never
  reaches `ComponentFactory::create_ai_provider`.
- **Coverage** — the 85% floor applies to new/changed code; new tests
  (frontend + Rust) close the gap instead of widening exclusions.

## Migration Plan

1. Land the backend command + GUI changes and tests in this repo.
2. (Optional follow-up) Land the crate diagnostic-logging change in
   subx-cli; if it ships in a new release, bump `subx-cli` in
   `src-tauri/Cargo.toml` + `Cargo.lock`.
3. Run `npm run verify` and (for the crate) `scripts/quality_check.sh`.

Rollback: revert the command, allowlist entry, and GUI changes — all
independent and safe to revert because the project is unreleased.

## Open Questions

- None — behavior is fully specified by the `settings-management` delta
  spec; the crate-side logging is a small separate change in the subx-cli
  repo.
