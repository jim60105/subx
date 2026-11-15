# Proposal: redesign-match-sources

## Why

In the match wizard's first step the source list sits above the relocation options and pushes them out of view, so users forget to choose a mode that cannot be changed after analysis. The step also explains itself in sentences ("Folders, individual files, and archives all work", three relocation hints) where the approved editorial redesign (`docs/superpowers/specs/2026-11-15-editorial-redesign-design.md`, "01 Sources") demonstrates instead.

This is the first of three changes that together deliver the design document's "Match wizard redesign"; that delivery item was split because the four steps plus three shared components clearly exceed one workday (see Batch).

## What Changes

- Three shared components, reused by later changes: `DiffPreview` (file consequences as `− removed`, `+ created`, or unmarked kept lines), `DropZone` (accepted input kinds as glyphs; large when empty, a compact strip afterwards), and `GroupedFileList` (sources grouped by parent folder, two columns, kind glyph, per-entry and per-group removal).
- Match step 1 becomes a fixed-height column: only the file list scrolls; the relocation options stay visible above the action bar however many sources are listed.
- The relocation choice becomes a three-segment radio group in which each segment shows a two-line diff of a sample file instead of a hint sentence. Sample file names are constants. The hint sentences remain as the radios' accessible descriptions.
- Scan totals are shown as large serif numerals with a noun label.
- The descriptive sentence and the step title remain in the document for assistive technology only.
- Locale keys made redundant are deleted from both `en` and `zh-TW`; shared component strings are added to the `common` namespace in both.
- The dev-only preview harness gains views for the empty and the long-list states.

Human-reviewed, not specified: visual fidelity to the mockup, the bottom fade of the list, and hover/focus polish are judged by the owner using `visual-review.md` in this change directory.

No backend or IPC change. Relocation mode is fixed at analysis time, which is why it stays in this step.

## Capabilities

### New Capabilities

- `diff-preview`: rendering file consequences (removed, created, kept) as marked lines that assistive technology can read without relying on colour.
- `source-intake`: how a wizard takes sources in — a drop zone that demonstrates the accepted input kinds, and a folder-grouped list of what has been added, with removal.

### Modified Capabilities

- `match-workflow`: "Multi-source selection with scan preview and relocation mode" gains the rule that the relocation choice stays visible outside the scrolling list and that each option demonstrates its effect as a diff.

## Impact

- New: `src/platform/fileKind.ts`, `src/components/icons/FileKindIcons.tsx`, `src/components/DiffPreview/`, `src/components/DropZone/`, `src/components/GroupedFileList/`, `src/features/match/relocationSamples.ts`, each with tests.
- Modified: `src/features/match/SourcesStep.tsx` and `.css`, `MatchWizard.tsx`, `useMatchWizard.ts` (`removeSource` → `removeSources`), `src/components/WizardShell/WizardShell.css` (content slot becomes a flex column), `src/locales/{en,zh-TW}/{common,match}.json`, `src/i18n/hardCodedStrings.test.tsx`, `src/features/match/MatchWizard.test.tsx`, `src/styles/layout.test.ts`, `scripts/preview/views.tsx`.
- No new dependency. No change under `src-tauri/`.

## Batch: editorial-redesign

- depends-on: editorial-visual-foundation
- Conflict note: shares `MatchWizard.tsx`, `useMatchWizard.ts`, `match.json`, `MatchWizard.test.tsx`, `hardCodedStrings.test.tsx`, `WizardShell.css`, and `scripts/preview/views.tsx` with `redesign-match-review` and `redesign-match-analysis-execute`; apply strictly in order. `show-convert-translate` and `show-sync-settings` consume the components introduced here.
