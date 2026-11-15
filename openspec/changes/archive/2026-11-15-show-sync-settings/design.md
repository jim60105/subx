# Design: show-sync-settings

## Context

Source of truth: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("Other screens", rows for Sync and Settings). Mockup (read-only, git-ignored): the sync and settings panels of `.superpowers/brainstorm/3955151-1794685630/content/editorial-uoq-v2.html`. The design document wins where they differ: the mockup draws an audio waveform lane; the document says **no waveform is drawn**, so only the two cue-bar rows are built.

State this change starts from (after `redesign-match-sources`):

- `OffsetField({ offsetMs, maxOffsetMs, exceedsMax, onChange })` is shared by `SyncMethodStep` (manual mode) and `SyncDetectStep`; it renders a millisecond `<input type="number" step={10}>`, a seconds echo, a hint sentence, and the over-limit error. Existing tests drive the number input.
- `SyncApplyStep({ offsetMs, outputPath, applyResult, applyError, onOutputPathChange })` renders an output-path text field and the "original is never changed" note. `SyncWizard.tsx` has `wizard.subtitlePath`.
- `SyncMethodStep` renders the sensitivity `<input type="range">` with a percent readout, a hint, and a per-run note.
- `SettingsScreen` renders a title, a subtitle, an AI section (description, `AiSettingsSection`, save row, `ConnectionTestPanel`) and a preferences section (description, `PreferencesSection` with `LanguageSelect variant="labeled"` and `ThemeSelect variant="labeled"`).
- `AiSettingsSection` renders the API key as an always-present empty password input whose placeholder is `saved.apiKeyMasked`. In `useSettingsForm`, an empty `draft.apiKey` means "leave as is" and is not dirty. Only `apiKeyMasked` and `apiKeySet` cross IPC.
- `ConfigDto` is `{ ai }` — **the configuration file's path is not available to the frontend**, and it differs per platform (and under Flatpak). No IPC may be added.
- `DiffPreview` and `baseName` exist. `PreferenceSelect` has variants `compact` (title bar) and `labeled` (settings only).

## Goals / Non-Goals

**Goals:** replace each sentence in the design document's table with its listed replacement, keeping every existing behaviour, test-driven input, and validation.

**Non-Goals:**

- Drawing audio or real cue positions; the preview is a fixed schematic.
- Restructuring the sync inputs or detect steps beyond what `OffsetField` brings with it; removing `detect.description` or `method.description` (not in the document's table).
- Showing an absolute configuration path, or adding a command that returns one.
- Changing the title-bar dropdowns, theme storage, `useSettingsForm`'s save/test logic, or anything under `src-tauri/`.

## Decisions

### D1: Offset figure, nudge controls, preview

`src/features/sync/OffsetField.tsx` (props unchanged) exports `export const NUDGE_STEP_MS = 50;` and renders, in order:

```tsx
<div className="offset-field">
  <div className="offset-field__headline">
    <span className="offset-field__figure serif" aria-hidden="true">{formatSeconds(offsetMs)}</span>
    <span className="offset-field__unit serif" aria-hidden="true">{t("offset.unit")}</span>
    <div className="offset-field__nudge">
      <button type="button" className="button offset-field__nudge-button"
              aria-label={t("offset.decrease", { step: NUDGE_STEP_MS })}
              onClick={() => onChange(offsetMs - NUDGE_STEP_MS)}>−</button>
      <button type="button" className="button offset-field__nudge-button"
              aria-label={t("offset.increase", { step: NUDGE_STEP_MS })}
              onClick={() => onChange(offsetMs + NUDGE_STEP_MS)}>+</button>
    </div>
  </div>
  <OffsetPreview offsetMs={offsetMs} />
  {/* existing <label> with the millisecond number input: unchanged */}
  <p className="offset-field__seconds visually-hidden">{t("offset.seconds", { seconds: (offsetMs / 1000).toFixed(3) })}</p>
  <p id={hintId} className="offset-field__hint visually-hidden">{t("offset.hint")}</p>   {/* the number input and both nudge buttons carry aria-describedby={hintId} */}
  {/* existing exceedsMax error: unchanged */}
</div>
```

`formatSeconds(ms)` returns a sign (`+`, `−` U+2212, or none for zero) and `Math.abs(ms / 1000).toFixed(2)`. Figure `font-size: var(--text-4xl)`; unit `var(--text-xl); color: var(--ink-2)`.

`src/features/sync/OffsetPreview.tsx`:

```ts
/** Schematic cue positions as [start %, end %]. Fixed; unrelated to the real subtitle. */
export const PREVIEW_CUES: readonly (readonly [number, number])[] = [[8, 22], [34, 46], [58, 76], [86, 94]];
/** The shifted row moves 1 % of the track per this many milliseconds… */
export const PREVIEW_MS_PER_PERCENT = 100;
/** …and saturates at this many percent in either direction. */
export const PREVIEW_MAX_SHIFT = 6;
export function previewShift(offsetMs: number): number;   // clamp(offsetMs / PREVIEW_MS_PER_PERCENT, -MAX, +MAX)
export function OffsetPreview({ offsetMs }: { offsetMs: number }): JSX.Element;
```

Markup: `<div className="offset-preview" aria-hidden="true" data-direction={offsetMs > 0 ? "later" : offsetMs < 0 ? "earlier" : "none"}>` with two lanes, each `<div className="offset-preview__lane"><span className="offset-preview__label">{t("offset.preview.original" | "offset.preview.shifted")}</span><div className="offset-preview__track">…</div></div>`. The original track has one `<span className="offset-preview__cue" data-row="original" style={{ left: `${start}%`, width: `${end - start}%` }} />` per cue; the shifted track the same with `data-row="shifted"` and `left: `${start + previewShift(offsetMs)}%``. CSS: original cues `border: 1px dashed var(--ink-3)`; shifted cues `background: var(--accent); transition: left var(--motion-base) var(--ease-out)`; both `border-radius: var(--radius-control)`. The transition is disabled by the global reduced-motion rule; the static equivalent is the bars at their final position.

### D2: Apply step

`SyncApplyStepProps` gains `subtitlePath: string | null`; `SyncWizard.tsx` passes `wizard.subtitlePath`. While not done, directly under the output-path field the step renders `<DiffPreview label={t("apply.outputLabel")} lines={[{ kind: "kept", text: baseName(subtitlePath ?? "") }, { kind: "created", text: baseName(outputPath) }]} />` (the kept line is omitted when `subtitlePath` is null) and the `apply.originalKept` note is removed. The text field, overwrite confirmation flow, error, and report are unchanged.

### D3: Sensitivity slider

In `SyncMethodStep.tsx` the slider gets `aria-describedby={hintId}`; the hint paragraph becomes `<p id={hintId} className="visually-hidden">{t("method.sensitivity.hint")}</p>`; beneath the slider a `<div className="sync-method__ends" aria-hidden="true"><span>{t("method.sensitivity.low")}</span><span>{t("method.sensitivity.high")}</span></div>` (`display: flex; justify-content: space-between; font-size: var(--text-xs); color: var(--ink-3)`). The percent readout and the per-run note stay.

### D4: Settings section headings

`SettingsScreen.tsx`: `<h1 className="settings__heading visually-hidden">{t("title")}</h1>` (the breadcrumb already names the screen); the subtitle paragraph is removed. Each section header becomes `<header className="settings-section__header"><h2 className="settings-section__title">…</h2><span className="settings-section__where">{t("ai.storedIn")}</span></header>` (`preferences.storedIn` for the second), with `display: flex; align-items: baseline; justify-content: space-between; border-bottom: 1px solid var(--ink)`; `.settings-section__where { font-family: var(--font-mono); font-size: var(--text-xs); color: var(--ink-3); }`. Both description paragraphs are removed.

`ai.storedIn` names the file, not a path: the real path is platform-dependent and not available without IPC. This is a deliberate deviation from the design document's "config path", recorded for the owner.

### D5: API key field

New `src/features/settings/ApiKeyField.tsx`:

```ts
interface ApiKeyFieldProps {
  saved: AiConfigDto;          // apiKeySet, apiKeyMasked
  value: string;               // draft.apiKey
  error: unknown;
  disabled: boolean;
  onChange: (value: string) => void;
}
```

Local state `replacing: boolean`, initially `false`. It is reset to `false` when `saved.apiKeyMasked` or `saved.apiKeySet` changes, i.e. when a key write actually landed. (Revised during apply: resetting on the `saved` object's identity would also fire on every window-focus refetch, which replaces `config` — a user who clicks Replace and switches to a password manager would come back to a vanished input, and a typed draft kept by the refetch would be hidden yet still saved.) The input is shown whenever `!saved.apiKeySet || replacing || value !== ""`, so a non-empty draft is never hidden (a rejected key write keeps its draft and its error visible). Rewriting a key whose masked form is identical leaves the empty input open, which is safe: an empty draft writes nothing. Inside `SettingsField id="ai-api-key"`:

- input hidden: `<span id="ai-api-key" className="settings-key__mask">{saved.apiKeyMasked}</span>` and `<button type="button" className="button button--tertiary" onClick={() => setReplacing(true)}>{t("ai.apiKey.replace")}</button>`. No input is rendered.
- otherwise: the existing password input (empty, `autoComplete="off"`, placeholder `t("ai.apiKey.unsetPlaceholder")` only when no key is set, focused through a ref when it appeared through Replace), plus, only when `saved.apiKeySet`, `<button type="button" className="button button--tertiary" onClick={() => { onChange(""); setReplacing(false); }}>{t("ai.apiKey.keep")}</button>`.

While the input is hidden there is no labelable control, so `SettingsField` gains `labelsControl?: boolean` (default `true`); with `false` the label renders as a `<span id="{id}-label">` instead of `<label htmlFor>` (a `<label>` pointing at a span is a dead association), and the Replace button is named by `aria-labelledby` = its own text plus that label ("Replace API key") and described by the masked key. Focus returns to Replace after "Keep current key". `SettingsField` also gains `hintHidden?: boolean`, which adds `visually-hidden` to the hint paragraph; the API key field passes `hint={t("ai.apiKey.hint")} hintHidden`. `AiSettingsSection.tsx` renders `<ApiKeyField … />` in place of its inline key field. `useSettingsForm` is not changed: an empty draft still means "leave as is".

### D6: Connection test

`ConnectionTestPanel.tsx`: the button gets `aria-describedby={descriptionId}`; the description paragraph becomes `<p id={descriptionId} className="visually-hidden">{t("test.description")}</p>`; on success, inside `.settings-test__action` next to the button: `<p className="settings-test__success" role="status"><span className="settings-test__dot" aria-hidden="true" /><span aria-hidden="true">{t("test.latency", { latency: result.latencyMs ?? 0 })}</span><span className="visually-hidden">{t("test.success", { latency: result.latencyMs ?? 0 })}</span></p>`. The failure `ErrorNotice` is unchanged. `.settings-test__dot { width: 8px; height: 8px; border-radius: 50%; background: var(--add); }`; the status text is mono, `color: var(--add)`.

### D7: Inline preference choices

New `src/components/PreferenceChoice/PreferenceChoice.tsx` (+ `.css`, `.test.tsx`):

```ts
interface PreferenceChoiceProps {
  label: string;
  value: string;
  options: PreferenceSelectOption[];
  onChange: (value: string) => void;
}
```

Markup: `<fieldset className="preference-choice"><legend className="preference-choice__label">{label}</legend>` then per option `<label className="preference-choice__option" data-checked={value === option.value}><input type="radio" className="visually-hidden" name={groupName} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />{option.label}</label>` (`groupName` from `useId`). Checked option: `color: var(--ink); font-weight: 600; border-bottom: 2px solid var(--accent)`; others `color: var(--ink-3)`; `:focus-within` shows the focus outline.

`PreferenceSelectVariant` becomes `"compact"` only: delete the `labeled` branch, its CSS, and its tests. `ThemeSelect` and `LanguageSelect` take `variant?: "compact" | "inline"` (default `compact`) and render `PreferenceChoice` for `inline`, `PreferenceSelect` otherwise, with the same label, value, options, and change handler. `PreferencesSection.tsx` uses `variant="inline"` for both.

### D8: Locale keys (both `en` and `zh-TW`; values are exact)

Add to `sync.json`:

| Key | en | zh-TW |
|---|---|---|
| `offset.unit` | s | 秒 |
| `offset.decrease` | Decrease by {{step}} ms | 減少 {{step}} 毫秒 |
| `offset.increase` | Increase by {{step}} ms | 增加 {{step}} 毫秒 |
| `offset.preview.original` | Original | 原本 |
| `offset.preview.shifted` | Shifted | 套用後 |
| `method.sensitivity.low` | Stricter | 較嚴格 |
| `method.sensitivity.high` | More sensitive | 較靈敏 |

Delete from `sync.json`: `apply.originalKept`. Keep `offset.hint`, `offset.seconds`, `method.sensitivity.hint` (now visually hidden).

Add to `settings.json`:

| Key | en | zh-TW |
|---|---|---|
| `ai.storedIn` | config.toml · shared with the SubX command line | config.toml · 與 SubX 命令列共用 |
| `preferences.storedIn` | This app only | 僅此應用程式 |
| `ai.apiKey.replace` | Replace | 取代 |
| `ai.apiKey.keep` | Keep current key | 保留現有金鑰 |
| `test.latency` | {{latency}} ms | {{latency}} ms |

(`ai.storedIn` was revised during apply: the original value named `subx-cli`, but `app-shell` "Thin Tauri command layer structure" forbids naming the engine crate anywhere outside `src-tauri/`, enforced by `backendCodeParity.test.ts`. The label uses the product term the removed subtitle already used.)

Delete from `settings.json`: `subtitle`, `ai.description`, `preferences.description`. Keep `title`, `ai.apiKey.hint`, `test.description`, `test.success` (now visually hidden).

If `fontCoverage.test.ts` reports a zh-TW character the bundled serif lacks, reword with covered characters and record it in `visual-review.md`; never weaken the test.

### D9: `hardCodedStrings.test.tsx`

Pass `subtitlePath` to the `SyncApplyStep` fixture. The Settings fixture's `ALLOWED` entry `/^\*{4}1234$/` already covers the masked key now rendered as text. No other allowlist change is expected.

### D10: Preview views

Add `sync-offset` (`OffsetField` with local state; `?ms=` sets the initial value), `sync-apply`, `sync-method` (automatic mode), and `settings` (the sections rendered with fixture props: `AiSettingsSection` with a configured key, `ConnectionTestPanel` in the success state, `PreferencesSection`), since the real `SettingsScreen` needs IPC.

### D11: Human review document

`openspec/changes/show-sync-settings/visual-review.md`.

## Risks / Trade-offs

- [The schematic preview is read as real timing] → fixed four bars, labelled "Original" / "Shifted", saturating shift, no waveform, `aria-hidden`.
- [`ai.storedIn` shows a file name rather than the path the design document asks for] → truthful on every platform without IPC; flagged for the owner, who may later allow a path-returning command.
- [A user opens "Replace", types nothing, and saves] → an empty draft is not dirty and writes nothing, exactly as today; the masked key returns after "Keep current key".
- [Removing the `labeled` select variant breaks its tests] → those tests are deleted with it; `PreferenceChoice.test.tsx` and the Settings scenarios cover the replacement.
- [Sighted users lose "saves first, then sends one request"] → intended by the design document; the sentence remains the button's accessible description.
