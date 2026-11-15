# Design: show-convert-translate

## Context

Source of truth: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("Other screens", rows for Convert and Translate). There is no mockup for these two wizards; they reuse the vocabulary of the match sources step.

State this change starts from (after `redesign-match-sources`):

- `DropZone`, `GroupedFileList`, `DiffPreview` / `DiffLine` (`DiffLineSpec = { kind: "removed" | "created" | "kept"; text: string }`), and `src/platform/fileKind.ts` exist. The `common` namespace has `dropZone.*`, `fileList.*`, `diff.*`.
- `ConvertSourcesStep` and `TranslateSourcesStep` each render their own drop box, browse buttons, and a flat source list, with a local `basename` helper and `onRemoveSource(path)`. `useConvertWizard` and `useTranslateWizard` expose `removeSource(path)`, which rescans.
- `ConvertOptionsStep` renders each `ConvertItemDto { id, inputName, inputPath, outputPath, outputExists, skipReason }` as checkbox + input name + "Will be written to `<outputPath>`" + flags. `ConvertRunStep` shows a summary and a "kept / deleted" sentence before running.
- `TranslateOptionsStep` renders each `TranslateItemDto { id, inputName, inputPath, outputPath, cueCount, outputExists, skipReason }` the same way plus a cue count. In replace mode `outputPath` equals the input path.
- Existing scenarios such as "Existing output is flagged", "Excluding an item", and "Existing output is excluded unless overwrite is enabled" are verified by tests in `ConvertWizard.test.tsx` / `TranslateWizard.test.tsx`; their behaviour and `@covers` lines must survive.

## Goals / Non-Goals

**Goals:** reuse the three shared components unchanged; keep every checkbox, flag, and backend-resolved path exactly as informative as today.

**Non-Goals:**

- Changing the run/report steps beyond the convert pre-run list (per-file progress and the per-item reports stay as they are, restyled only by tokens).
- Pinned-scroll layouts, large numerals for scan counts, or animations.
- Changing which items are selectable, any plan/preview logic, or anything under `src-tauri/`.
- Sync and Settings (`show-sync-settings`).

## Decisions

### D1: Source steps

Both steps take `onRemoveSources: (paths: string[]) => void` instead of `onRemoveSource`; both hooks rename `removeSource(path)` to `removeSources(paths: string[])` (filter all given paths out, one rescan), and both wizards pass it. The local `basename` helpers in the two source steps are deleted.

Render order in each step root: `<h2 className="visually-hidden">{t("sources.title")}</h2>`; `<DropZone kinds={["folder", "subtitle", "archive"]} compact={sources.length > 0} description={t("sources.description")} onBrowseFiles onBrowseFolder />`; `{sources.length > 0 && <GroupedFileList paths={sources} label={t("sources.listLabel")} onRemove={onRemoveSources} />}`; then the existing scan status, the translate step's "files found" list with cue counts, and the scan error, all unchanged. The step keeps natural height; `.wizard__content` stays the scroller (`GroupedFileList`'s own `overflow-y: auto` is inert without a height constraint, and its mask fade is disabled here with `.convert-sources .file-groups, .translate-sources .file-groups { flex: none; mask-image: none; padding-bottom: 0; }`; `flex: none` is required because the list's own `flex: 1 1 0` collapses it to zero height in an unbounded column, found during the visual review).

### D2: Plan lines (pure helpers)

`src/features/convert/planLines.ts`:

```ts
/** Excluded: [kept input]. Otherwise: [keepOriginal ? kept : removed input, created output]. */
export function convertItemLines(item: ConvertItemDto, keepOriginal: boolean): DiffLineSpec[];
```

`src/features/translate/planLines.ts`:

```ts
/** Excluded: [kept input]. Suffix: [kept input, created output]. Replace: [removed input, created output]. */
export function translateItemLines(item: TranslateItemDto, outputMode: TranslateOutputModeDto): DiffLineSpec[];
```

In both, the input line's text is `item.inputName` and the created line's text is the full `item.outputPath` (the existing requirement is an *exact* output-path preview). "Excluded" means `item.skipReason !== null`.

### D3: Options rows

In both `PlanRow`s the body `<span className="…__item-body">` becomes: `<DiffPreview lines={…ItemLines(item, …)} label={item.inputName} />`, followed (translate only) by the existing cue-count span. The `…__input` and `…__output` spans and the `options.outputLabel` text are removed. Checkbox, `aria-label`, `data-excluded`, the exclusion flag, and the overwrite flag are unchanged. `ConvertOptionsStep` passes `keepOriginal`; `TranslateOptionsStep` passes `outputMode`.

Removed elements: the `options.description` paragraph in both steps (the `<h2>` title stays visible), and `options.keepOriginalHint` in convert. The encoding note, glossary hint, replace note, overwrite hint, and terminology note stay.

### D4: Convert run step

`ConvertRunStepProps` gains `plan: ConvertPlanDto | null` and `selectedIds: Set<number>`; `ConvertWizard.tsx` passes them. While `!isConverting && report === null && plan !== null`, the step renders `<ul className="convert-run__planned" aria-label={t("options.listLabel")}>` with one `<li>` per selected item (plan order) holding `<DiffPreview lines={convertItemLines(item, keepOriginal)} label={item.inputName} />`. The `convert-run__originals` paragraph is removed. Progress, error, and report rendering are unchanged.

### D5: Locale keys (delete from both `en` and `zh-TW`)

- `convert.json`: `sources.dropzone`, `sources.dropHint`, `sources.browseFiles`, `sources.browseFolder`, `sources.empty`, `sources.remove`, `options.description`, `options.keepOriginalHint`, `options.outputLabel`, `run.keepingOriginals`, `run.removingOriginals`.
- `translate.json`: `sources.dropzone`, `sources.dropHint`, `sources.browseFiles`, `sources.browseFolder`, `sources.empty`, `sources.remove`, `options.description`, `options.outputLabel`.

No key is added. Before deleting, `grep -rn "<key>" src` must show no remaining use.

### D6: `hardCodedStrings.test.tsx`

Pass the new props. Give the convert and translate plan fixtures one runnable item each with `inputName: "ep01.srt"`, `inputPath: "/fixtures/a/ep01.srt"`, and an `outputPath` under `/fixtures/a/` so the diff lines reach the DOM (the `/fixtures/` allowlist pattern from `redesign-match-sources` covers the paths; `ep01.srt` is key-shaped).

### D7: Preview views

Add `convert-sources` (three sources in two folders), `convert-options` (four items: runnable, overwrite-flagged, same-format excluded, collision excluded; `?keep=0` turns keep-original off), `convert-run` (idle with two selected), and `translate-options` (`?mode=replace` switches mode; one item excluded).

### D8: Human review document

`openspec/changes/show-convert-translate/visual-review.md`.

## Risks / Trade-offs

- [Replace mode as `− file` / `+ file` with the same name may read oddly] → it is the literal consequence (old content gone, new content written) and the replace/backup note stays beside the mode choice; recorded for owner review.
- [Full output paths are long in a mono line] → `DiffLine` truncates with an ellipsis and carries no tooltip; the row sets `title={item.outputPath}` on its `<li>`.
- [Existing tests query the removed "Will be written to" text or the old list markup] → tasks update those queries; every existing `@covers` line stays.
- [Screen-reader users lose the keep-original hint] → each diff line announces its kind ("removed", "created", "unchanged") as text.
