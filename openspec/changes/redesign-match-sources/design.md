# Design: redesign-match-sources

## Context

Source of truth: `docs/superpowers/specs/2026-11-15-editorial-redesign-design.md` ("Shared components — Diff preview", "Match wizard — 01 Sources"). Mockup (read-only, git-ignored): `.superpowers/brainstorm/3955151-1794685630/content/match-flow-v2.html`, first panel. The design document wins where they differ; the mockup's "clear all" link is not in the document and is not built.

State this change starts from (after `editorial-visual-foundation`):

- `src/features/match/SourcesStep.tsx` renders intro, a drop box with two browse buttons, a flat `<ul>` of sources (base name + remove button), a `<fieldset>` of three native radios with hint sentences, and a `role="status"` scan line. It sits inside `WizardShell`'s `.wizard__content`, which is the scrolling element (`overflow-y: auto`), so a long source list scrolls the relocation radios away.
- `useMatchWizard` holds `sources: string[]` (absolute paths the user added; a folder is one entry) and exposes `addSources(paths)` / `removeSource(path)`; each mutation rescans. `SourceScanResult` is `{ videoCount, subtitleCount }` only — the frontend never sees the scanned file list, so the list groups *the added sources*, not the files found inside them.
- The whole window is already a drop target (`subscribeToDroppedPaths` in `MatchWizard.tsx`). That stays.
- Extension sets the engine uses (`subx-core` 1.0.1): video `mp4 mkv avi mov wmv flv m4v webm`; subtitle `srt ass vtt sub ssa idx`; archive `zip rar 7z tgz` and the `.tar.gz` suffix.
- `src/styles/flatness.test.ts` allows `gradient(` only inside a `mask-image` declaration; `tokens.colorLiteral.test.ts` forbids colour literals, including inside a mask.
- `hardCodedStrings.test.tsx` flags rendered text with letters that is neither a key nor in `ALLOWED`.

## Goals / Non-Goals

**Goals:**

- Three presentational components with small, typed contracts that convert, translate, sync, and the match execute step can reuse unchanged.
- A sources step whose only scroller is the file list.

**Non-Goals:**

- The analysis, review, and execute steps (`redesign-match-review`, `redesign-match-analysis-execute`).
- Using these components in convert / translate / sync (`show-convert-translate`, `show-sync-settings`). Their `basename` helpers and source lists are not touched here.
- A "clear all" action, drag-reordering, per-file scan results, or abbreviating paths to `~` (the home directory is not available to the frontend and no IPC is added).
- Any change under `src-tauri/` or to `src/types/bindings.ts`.

## Decisions

### D1: `src/platform/fileKind.ts`

```ts
export type FileKind = "folder" | "video" | "subtitle" | "archive" | "other";
export const VIDEO_EXTENSIONS = ["mp4", "mkv", "avi", "mov", "wmv", "flv", "m4v", "webm"] as const;
export const SUBTITLE_EXTENSIONS = ["srt", "ass", "ssa", "vtt", "sub", "idx"] as const;
export const ARCHIVE_EXTENSIONS = ["zip", "rar", "7z", "tgz"] as const;

/** Last path segment; handles `/` and `\`, ignores a trailing separator. */
export function baseName(path: string): string;
/** Everything up to and including the last separator before the base name; "" when there is none. */
export function parentFolder(path: string): string;
/** Kind from the base name's extension, case-insensitive. `.tar.gz` is an archive.
 *  A base name with no extension (no dot, or only a leading dot) is a folder. Anything else is "other". */
export function fileKind(path: string): FileKind;
```

A path without an extension is shown as a folder. The frontend cannot stat the path and no IPC is added; an extensionless file gets the folder glyph, which is cosmetic and accepted.

`src/platform/fileKind.test.ts` covers each kind, upper-case extensions, `.tar.gz`, Windows separators, a trailing separator, and a dot-file.

### D2: `src/components/icons/FileKindIcons.tsx`

`FileKindIcon({ kind, size = 16 }: { kind: FileKind; size?: number })` returns an `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">` with these paths (from the mockup, verbatim):

| kind | children |
|---|---|
| `folder` | `<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>` |
| `video` | `<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="m10 9 5 3-5 3z"/>` |
| `subtitle` | `<rect x="3" y="5" width="18" height="14" rx="1.5"/><path d="M7 14h6M15 14h2M7 11h3M12 11h5"/>` |
| `archive` | `<path d="M6 3h9l4 4v14H6z"/><path d="M11 3v2M11 7v2M11 11v2M11 15v2"/>` |
| `other` | `<path d="M6 3h9l4 4v14H6z"/>` |

### D3: `src/components/DiffPreview/`

```tsx
export type DiffLineKind = "removed" | "created" | "kept";
export interface DiffLineSpec { kind: DiffLineKind; text: string; }

/** One consequence line. Usable on its own inside another list. */
export function DiffLine(props: DiffLineSpec): JSX.Element;

export interface DiffPreviewProps {
  lines: readonly DiffLineSpec[];
  /** Accessible name of the list; omitted when decorative. */
  label?: string;
  /** Hides the whole preview from assistive technology. */
  decorative?: boolean;
}
export function DiffPreview(props: DiffPreviewProps): JSX.Element;
```

`DiffLine` markup: `<span className="diff-line" data-kind={kind}><span className="diff-line__mark" aria-hidden="true">{MARK[kind]}</span><span className="diff-line__text">{text}</span><span className="visually-hidden">{t(`common:diff.${kind}`)}</span></span>` with `MARK = { removed: "−", created: "+", kept: "" }` (`−` is U+2212). `DiffPreview` renders `<ul className="diff-preview" aria-label={label} aria-hidden={decorative || undefined}>` with one `<li>` per line wrapping a `DiffLine`.

`DiffPreview.css`: mono font, `--text-xs`; `.diff-line__mark { display: inline-block; width: 1em; }`; `[data-kind="removed"] { color: var(--del); } [data-kind="removed"] .diff-line__text { text-decoration: line-through; }`; `[data-kind="created"] { color: var(--add); }`; kept `color: var(--ink-2)`; text truncates with an ellipsis.

### D4: `src/components/DropZone/`

```tsx
export type IntakeKind = Exclude<FileKind, "other">;
/** Captions under the glyphs in the large form. Extensions are data, not prose. */
export const KIND_CAPTIONS: Record<Exclude<IntakeKind, "folder">, string> = {
  video: ".mkv .mp4",
  subtitle: ".srt .ass",
  archive: ".zip .7z",
};

export interface DropZoneProps {
  /** Accepted input kinds, in display order. */
  kinds: readonly IntakeKind[];
  /** True once at least one source is listed. */
  compact: boolean;
  /** The sentence the glyphs replace; rendered visually hidden. */
  description: string;
  onBrowseFiles: () => void;
  onBrowseFolder: () => void;
}
```

Markup:

```tsx
<div className="drop-zone" data-state={compact ? "compact" : "large"}
     role="group" aria-label={t("common:dropZone.label")} aria-describedby={descriptionId}>
  <p id={descriptionId} className="visually-hidden">{description}</p>
  <ul className="drop-zone__kinds" aria-hidden="true">
    {kinds.map((kind) => (
      <li key={kind} className="drop-zone__kind" data-kind={kind}>
        <FileKindIcon kind={kind} size={compact ? 16 : 22} />
        {!compact && (
          <span className="drop-zone__caption">
            {kind === "folder" ? t("common:fileKinds.folder") : KIND_CAPTIONS[kind]}
          </span>
        )}
      </li>
    ))}
  </ul>
  {compact && <span className="drop-zone__hint">{t("common:dropZone.label")}</span>}
  <div className="drop-zone__actions">
    <button type="button" className="button drop-zone__browse" onClick={onBrowseFiles}>{t("common:dropZone.browseFiles")}</button>
    <button type="button" className="button drop-zone__browse" onClick={onBrowseFolder}>{t("common:dropZone.browseFolder")}</button>
  </div>
</div>
```

`DropZone.css`: `border: 1px dashed var(--ink-3); border-radius: var(--radius-control)`. Large: column, centred, `padding: var(--space-5)`. Compact: one row, `padding: var(--space-2) var(--space-3)`, kinds at the inline start, actions at the inline end. The component does not handle drop events; the wizard's window-level subscription does.

### D5: `src/components/GroupedFileList/`

`groupByParent.ts`:

```ts
export interface FileGroup { folder: string; paths: string[]; }
/** Groups by `parentFolder(path)`, groups in first-seen order, paths in given order. */
export function groupByParent(paths: readonly string[]): FileGroup[];
```

`GroupedFileList.tsx`:

```tsx
export interface GroupedFileListProps {
  paths: readonly string[];
  /** Accessible name of the whole list. */
  label: string;
  /** Asked to remove one entry (`[path]`) or a whole group (all its paths). */
  onRemove: (paths: string[]) => void;
}
```

Markup: `<div className="file-groups" role="group" aria-label={label}>`; per group `<section className="file-groups__group" aria-label={group.folder}>` containing `<header className="file-groups__header">` (`<span className="file-groups__folder" title={folder}>`, `<span className="file-groups__count">{paths.length}</span>`, `<button type="button" className="button button--tertiary file-groups__remove-group" aria-label={t("common:fileList.removeGroup", { count, folder })} onClick={() => onRemove(group.paths)}>{t("common:fileList.removeGroupShort")}</button>`) and `<ul className="file-groups__entries">` with one `<li className="file-groups__entry" data-kind={fileKind(path)}>` per path: `FileKindIcon`, `<span className="file-groups__name" title={path}>{baseName(path)}</span>`, `<button type="button" className="file-groups__remove" aria-label={t("common:fileList.remove", { name: baseName(path) })} onClick={() => onRemove([path])}>✕</button>`.

`GroupedFileList.css` (the declarations the layout test asserts are marked †):

```css
.file-groups {
  flex: 1 1 0;
  min-height: 0;            /* † */
  padding-bottom: var(--space-6);
  overflow-y: auto;         /* † */
  border-top: 1px solid var(--hair);
  border-bottom: 1px solid var(--hair);
  mask-image: linear-gradient(to bottom, var(--ink) calc(100% - var(--space-6)), transparent);
}
.file-groups__header { position: sticky; top: 0; background: var(--paper); font-family: var(--font-mono); font-size: var(--text-xs); color: var(--ink-3); }
.file-groups__entries { margin: 0; padding: 0; list-style: none; columns: 2; column-gap: var(--space-5); }
.file-groups__entry { display: flex; gap: var(--space-2); align-items: center; overflow: hidden; white-space: nowrap; break-inside: avoid; font-family: var(--font-mono); font-size: var(--text-sm); }
.file-groups__name { overflow: hidden; text-overflow: ellipsis; }
.file-groups__remove { margin-inline-start: auto; opacity: 0; background: none; border: none; color: var(--ink-3); cursor: pointer; }
.file-groups__entry:hover .file-groups__remove,
.file-groups__remove:focus-visible { opacity: 1; }   /* † */
```

The mask uses `var(--ink)` (opaque in both themes) and `transparent`, so it contains no colour literal; only the alpha channel matters. The bottom padding lets the last row scroll clear of the fade.

### D6: Sources step layout

`WizardShell.css` gains `display: flex; flex-direction: column;` on `.wizard__content` (it stays the scroller for every other step, whose roots keep their natural height because flex items do not shrink below their content).

`SourcesStep.tsx` props become:

```ts
interface SourcesStepProps {
  sources: string[];
  scan: SourceScanResult | null;
  isScanning: boolean;
  scanError: unknown;
  mode: RelocationModeDto;
  onBrowseFiles: () => void;
  onBrowseFolder: () => void;
  onRemoveSources: (paths: string[]) => void;
  onModeChange: (mode: RelocationModeDto) => void;
}
```

Render order inside `<div className="sources-step">`:

1. `<h2 className="visually-hidden">{t("sources.title")}</h2>`
2. `<DropZone kinds={["folder", "video", "subtitle", "archive"]} compact={sources.length > 0} description={t("sources.description")} … />`
3. `<div className="sources-step__scan" role="status">` — scanning text; or, when `scan !== null` and sufficient, `<span className="sources-step__tally"><span className="sources-step__figure serif">{scan.videoCount}</span> {t("sources.scan.videoLabel", { count: scan.videoCount })}</span>` and the same for subtitles; or the insufficient message.
4. `{scanError !== undefined && <ErrorNotice error={scanError} role="status" />}`
5. `{sources.length > 0 && <GroupedFileList paths={sources} label={t("sources.listLabel")} onRemove={onRemoveSources} />}`
6. `<fieldset className="sources-step__modes">` with `<legend className="visually-hidden">{t("sources.relocation.label")}</legend>` and a `<div className="sources-step__mode-grid">` (a `fieldset` is an unreliable grid container in WebKit, so the grid is the inner `div`) holding, per mode, a `<label className="sources-step__mode" data-checked={mode === option}>` holding `<input type="radio" className="visually-hidden" name="relocation-mode" value={option} checked={mode === option} aria-describedby={`relocation-hint-${option}`} onChange={() => onModeChange(option)} />`, `<span className="sources-step__mode-name"><span className="sources-step__mode-dot" aria-hidden="true" />{t(`sources.relocation.${option}`)}</span>`, and `<DiffPreview decorative lines={RELOCATION_SAMPLES[option]} />`; after the grid `div`, still inside the `fieldset`, three `<span id={`relocation-hint-${option}`} className="visually-hidden">{t(`sources.relocation.${option}Hint`)}</span>` (outside the labels so each radio's accessible name stays the mode name).

`SourcesStep.css` (the declarations the layout test asserts are marked †):

```css
.sources-step { display: flex; flex: 1 1 0; flex-direction: column; gap: var(--space-4); min-height: 0; overflow: hidden; }   /* † overflow, min-height */
.sources-step > :not(.file-groups) { flex-shrink: 0; }   /* † */
.sources-step__figure { font-size: var(--text-2xl); line-height: 1; }
.sources-step__modes { min-width: 0; margin: 0; padding: 0; border: 0; }
.sources-step__mode-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border: 1px solid var(--hair); }
.sources-step__mode { display: flex; flex-direction: column; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-top: 2px solid transparent; border-inline-end: 1px solid var(--hair); cursor: pointer; }
.sources-step__mode[data-checked="true"] { background: var(--paper-2); border-top-color: var(--accent); }
.sources-step__mode:focus-within { outline: 2px solid var(--accent); outline-offset: -2px; }
.sources-step__mode-dot { width: 13px; height: 13px; border: 1.5px solid var(--ink-3); border-radius: 50%; }
.sources-step__mode[data-checked="true"] .sources-step__mode-dot { border: 4px solid var(--accent); }
```

`src/features/match/relocationSamples.ts`:

```ts
import type { DiffLineSpec } from "../../components/DiffPreview/DiffPreview";
import type { RelocationModeDto } from "../../types/ipc";

/** Sample file names: constants, never translated. */
export const RELOCATION_SAMPLES: Record<RelocationModeDto, readonly DiffLineSpec[]> = {
  rename: [{ kind: "removed", text: "subs/03.ass" }, { kind: "created", text: "subs/S01E03.ass" }],
  copy: [{ kind: "kept", text: "subs/03.ass" }, { kind: "created", text: "video/S01E03.ass" }],
  move: [{ kind: "removed", text: "subs/03.ass" }, { kind: "created", text: "video/S01E03.ass" }],
};
```

`useMatchWizard.ts`: replace `removeSource(path: string)` with `removeSources(paths: string[])` (filter all given paths out, one rescan). `MatchWizard.tsx` passes `onRemoveSources={wizard.removeSources}`.

*Alternative considered:* a custom `role="radio"` button group as in the mockup. Rejected: native radios already give arrow-key behaviour and the existing tests query them by role; a visually hidden input inside a styled label keeps both.

### D7: Locale keys (both `en` and `zh-TW`; values are exact)

Add to `common.json`:

| Key | en | zh-TW |
|---|---|---|
| `dropZone.label` | Drop files or folders anywhere on this window | 將檔案或資料夾拖曳到視窗任一處 |
| `dropZone.browseFiles` | Browse files | 瀏覽檔案 |
| `dropZone.browseFolder` | Browse folder | 瀏覽資料夾 |
| `fileKinds.folder` | Folder | 資料夾 |
| `fileList.remove` | Remove {{name}} | 移除 {{name}} |
| `fileList.removeGroup` | Remove all {{count}} items in {{folder}} | 移除 {{folder}} 中的全部 {{count}} 個項目 |
| `fileList.removeGroupShort` | Remove | 移除 |
| `diff.removed` | removed | 移除 |
| `diff.created` | created | 建立 |
| `diff.kept` | unchanged | 不變 |

Add to `match.json`: `sources.scan.videoLabel_one` (video / 影片), `sources.scan.videoLabel_other` (videos / 影片), `sources.scan.subtitleLabel_one` (subtitle / 字幕), `sources.scan.subtitleLabel_other` (subtitles / 字幕).

The three `diff.*` texts are deliberately tense-neutral: the same lines describe a planned consequence (this step, convert, translate, sync) and a finished one (the match execute step).

Delete from `match.json`: `sources.dropzone`, `sources.dropHint`, `sources.browseFiles`, `sources.browseFolder`, `sources.empty`, `sources.remove`, `sources.scan.counts`.

Keep: `sources.title`, `sources.description`, `sources.listLabel`, every `sources.relocation.*` key including the three hints, `sources.scan.scanning`, `sources.scan.insufficient`, `sources.analyze`.

If `fontCoverage.test.ts` reports a zh-TW character the bundled serif lacks, reword that string with covered characters and record the change in `visual-review.md`; never weaken the test.

### D8: `hardCodedStrings.test.tsx`

Render `SourcesStep` twice in `SCREENS`: empty (`sources={[]}`) and populated (`sources={["/fixtures/show/ep01.mkv", "/fixtures/show/ep01.tc.ass"]}` with a scan result). Extend `ALLOWED` with: exact patterns for every `KIND_CAPTIONS` value and every `text` in `RELOCATION_SAMPLES` (built from the imported constants, regex-escaped), and `/^\/fixtures\/[\w./-]*$/` for the fixture folder path, each with a one-line comment saying why it is data, not prose.

### D9: Preview views

Add to `scripts/preview/views.tsx`: `match-sources-empty` (no sources) and `match-sources-long` (60 sources across three folders, a scan result, `mode="rename"`), both rendering `SourcesStep` inside a `WizardShell` with the match step labels so the pinned layout is visible.

### D10: Human review document

`openspec/changes/redesign-match-sources/visual-review.md` records what a test cannot judge.

## Risks / Trade-offs

- [Percentage/flex height chain breaks in WebKitGTK and the step scrolls after all] → the chain is `.app__main` (flex: 1) → `.wizard` (height: 100%) → `.wizard__content` (flex: 1; min-height: 0; flex column) → `.sources-step` (flex: 1 1 0; min-height: 0; overflow: hidden) → `.file-groups` (flex: 1 1 0; min-height: 0; overflow-y: auto); the stylesheet assertions pin each link and the `match-sources-long` preview view plus `npm run dev:app` confirm it in a real engine during review.
- [The bottom fade also dims the last rows when scrolled to the end] → bottom padding equal to the fade height lets the final row scroll clear.
- [Removed sentences were the only explanation for screen-reader users] → the description and the three hints stay as visually hidden text wired with `aria-describedby`.
- [An extensionless file shows a folder glyph] → accepted; noted in D1.
- [Making `.wizard__content` a flex column changes other steps' layout] → their roots are single block children with default `flex: 0 1 auto` and `min-height: auto`, so they keep natural height and the panel still scrolls; `WizardShell.test.tsx` and `actionPlacement.test.tsx` must stay green and every other step is checked in the preview during review.
