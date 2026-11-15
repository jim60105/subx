# Proposal: show-convert-translate

## Why

The convert and translate wizards still explain themselves in sentences: "Folders, single files and archives all work", "Each file below shows where the output is written", "Each input is deleted after it converts". The approved editorial redesign (`docs/superpowers/specs/2026-11-15-editorial-redesign-design.md`, "Other screens") replaces each with the shared components the match wizard already uses, so the screen shows the consequence instead of describing it.

First of two changes delivering the design document's "Show, don't tell for the remaining screens" (split because four screens clearly exceed one workday; see Batch).

## What Changes

- Convert and translate source steps use the shared `DropZone` (folder, subtitle, archive glyphs) and `GroupedFileList`; the descriptive sentence stays for assistive technology only.
- Convert options: every planned conversion renders as a diff — the output as a created line, the input as a kept line while "keep original" is on and as a removed line while it is off. The "shows exactly where" sentence, the "will be written to" label, and the keep-original hint are removed.
- Convert run step, before running: the selected conversions are listed as the same diffs, replacing the "originals will be kept / deleted" sentence.
- Translate options: every planned translation renders as a diff — suffix mode keeps the input and creates the output; replace mode removes and re-creates the same file. The "shows exactly where" sentence and the "will be written to" label are removed.
- Exclusion reasons, overwrite warnings, the encoding note, the backup note, and every error message stay as text: a design cannot carry them.
- Locale keys made redundant are deleted from both `en` and `zh-TW`.

Human-reviewed, not specified: visual fidelity and readability of the diff lists are judged by the owner using `visual-review.md` in this change directory.

No backend or IPC change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `convert-workflow`: two requirements added — the sources step demonstrates accepted inputs; planned conversions render as file consequences.
- `translate-workflow`: two requirements added — the sources step demonstrates accepted inputs; planned translations render as file consequences.

## Impact

- New: `src/features/convert/planLines.ts`, `src/features/translate/planLines.ts`, each with tests.
- Modified: `ConvertSourcesStep`, `ConvertOptionsStep`, `ConvertRunStep`, `ConvertWizard`, `useConvertWizard` (`removeSource` → `removeSources`); `TranslateSourcesStep`, `TranslateOptionsStep`, `TranslateWizard`, `useTranslateWizard` (same rename); their stylesheets and tests; `src/locales/{en,zh-TW}/{convert,translate}.json`; `src/i18n/hardCodedStrings.test.tsx`; `scripts/preview/views.tsx`.
- No new dependency. No change under `src-tauri/`.

## Batch: editorial-redesign

- depends-on: editorial-visual-foundation
- depends-on: redesign-match-sources
- Conflict note: shares only `src/i18n/hardCodedStrings.test.tsx` and `scripts/preview/views.tsx` with the other changes; it touches no match, sync, or settings file. Apply after `redesign-match-sources` (it consumes `DropZone`, `GroupedFileList`, `DiffPreview`, `fileKind`). Independent of `redesign-match-review`, `redesign-match-analysis-execute`, and `show-sync-settings` apart from those two shared files.
