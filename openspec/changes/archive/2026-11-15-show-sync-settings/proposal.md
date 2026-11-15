# Proposal: show-sync-settings

## Why

The sync wizard and the Settings screen still rely on explanatory sentences — "Positive delays, negative advances", "Your file is untouched; a copy is written above", "Stored keys are never shown. Leave empty to keep…", "Saves, then sends one short request". The approved editorial redesign (`docs/superpowers/specs/2026-11-15-editorial-redesign-design.md`, "Other screens") replaces each with a design that demonstrates it.

Second of two changes delivering the design document's "Show, don't tell for the remaining screens" (split because four screens clearly exceed one workday; see Batch).

## What Changes

- Sync offset: the offset in seconds becomes the largest element, with nudge buttons beside it and schematic cue bars (a dashed "original" row and a solid "shifted" row) that move with the value. No waveform is drawn — no audio data crosses IPC. The millisecond field stays.
- Sync apply: source and output render as a diff (source unmarked, output created) instead of the "your file is untouched" sentence.
- Sync sensitivity: the slider gets a label at each end instead of the "lower is stricter" sentence.
- Settings sections: each heading states at its inline end where its values live (the shared `config.toml`; "This app only").
- Settings API key: a configured key is shown masked with a "Replace" action instead of an always-present empty input and a hint paragraph.
- Settings connection test: the outcome appears beside the button as a status dot with the latency.
- Settings language and theme: options are laid out inline as single-choice groups; the title bar keeps its dropdowns.
- Every removed sentence that assistive technology still needs stays as visually hidden text or an accessible description. Redundant locale keys are deleted from both `en` and `zh-TW`; new keys are added to both.

Human-reviewed, not specified: visual fidelity to the mockup and the feel of the cue-bar movement are judged by the owner using `visual-review.md` in this change directory.

No backend or IPC change. Raw API keys still never cross IPC (only `apiKeyMasked` and `apiKeySet` do); theme storage stays in `localStorage` under `subx.theme` and is never written to `config.toml`.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `sync-workflow`: three requirements added — the offset figure with nudge controls and a schematic preview; the apply step's diff; the labelled sensitivity slider.
- `settings-management`: "API key is masked and write-only", "AI connection test", and "GUI-local preferences on the same screen" are modified; a requirement is added for the storage labels on the section headings.
- `theme-system`: the popover requirement is narrowed to preferences presented as dropdowns, because Settings no longer presents them that way.

## Impact

- New: `src/features/sync/OffsetPreview.tsx` and `.css`, `src/components/PreferenceChoice/`, `src/features/settings/ApiKeyField.tsx`, each with tests.
- Modified: `src/features/sync/OffsetField.tsx`, `SyncMethodStep.tsx`, `SyncApplyStep.tsx`, `SyncWizard.tsx` and their stylesheets/tests; `src/features/settings/SettingsScreen.tsx`, `AiSettingsSection.tsx`, `ConnectionTestPanel.tsx`, `PreferencesSection.tsx`, `SettingsField.tsx`, `SettingsScreen.css`, `SettingsScreen.test.tsx`; `ThemeSelect`, `LanguageSelect`, `PreferenceSelect` (the `labeled` variant is removed); `src/locales/{en,zh-TW}/{sync,settings}.json`; `src/i18n/hardCodedStrings.test.tsx`; `scripts/preview/views.tsx`.
- No new dependency. No change under `src-tauri/`.

## Batch: editorial-redesign

- depends-on: editorial-visual-foundation
- depends-on: redesign-match-sources
- Conflict note: shares only `src/i18n/hardCodedStrings.test.tsx` and `scripts/preview/views.tsx` with the other changes; it touches no match, convert, or translate file. Apply after `redesign-match-sources` (it consumes `DiffPreview` and `baseName`). Independent of `redesign-match-review`, `redesign-match-analysis-execute`, and `show-convert-translate` apart from those two shared files.
