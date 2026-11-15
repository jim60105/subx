# Design

## Context

See `proposal.md` for motivation and `docs/superpowers/specs/2026-11-15-translate-ledger-and-batch-progress-design.md` for the approved brainstorming result; its mockup is `.superpowers/brainstorm/760190-1794750109/content/translate-redesign.html` (options `sources-a` and `run-a`, without the terminology strip). That document's "Backend: collecting the events" section predates the upstream change and is superseded by D5 here.

The reference document's "Specs" paragraph is also superseded on two points: the batch-execution requirement keeps its name and scenario names (its scenarios carry existing `@covers` IDs), and this change's new scenarios stay unannotated until archive syncs them, per the repository's traceability rule.

Current state:

- `TranslateSourcesStep` renders `GroupedFileList` (the added source paths, grouped by parent folder) and then a second list of `scan.files`. `TranslateScanItemDto` is `{ name, cueCount, unparsable }` and cannot be tied back to a source.
- `scan_translate_inputs` (`src-tauri/src/commands/translate.rs`) flattens every source through `InputPathHandler::collect_files()` and `subtitle_files()`. `CollectedFiles::archive_origin(path)` maps an extracted file to its archive.
- `translate_batch_off_thread` builds one `TranslationEngine` per run and reports `TranslateProgress { stage, index, total, fileName }` once per file through the `TranslateReporter` seam; `useTranslateWizard` keeps only the latest value.
- `subx-core` `1.1` adds `ProgressEvent::Translation(TranslationProgress)` with `TerminologyStarted`, `TerminologyFinished { terms }`, `BatchStarted { pass, batch, batches, cues, attempt }` and `BatchFinished { pass, batch, batches, processed_cues, total_cues }`; `pass` is `Initial` or `FillIn`, `attempt` is 1 or 2. Both enums are `#[non_exhaustive]`.
- The visual identity is flat: `flatness.test.ts` rejects gradients (except in mask properties), shadows, blur and `color-mix`; colours come from tokens only. `.wizard__content` is the scroller of the translate steps.

## Goals / Non-Goals

**Goals:**

- One list on the sources step, with no information lost.
- A run display in which every visual change corresponds to an engine event.
- Keep `GroupedFileList` and the other wizards untouched.

**Non-Goals:**

- Terminology, token usage or translated text in the UI.
- Per-file exclusion inside a folder or archive source on the sources step.
- Collapsible groups or virtual scrolling.
- Changing cancellation, output writing, the options step or the report step.

## Decisions

### D1 — A translate-specific ledger instead of extending `GroupedFileList`

New `TranslateSourceLedger` in `src/features/translate/`. `GroupedFileList` is a two-column list of source paths specified by `source-intake` and shared by four wizards; the ledger is single-column, lists scan results rather than sources, and needs a count column and subtotals. Bending the shared component to both shapes would put translate-only props and a second layout into it. The ledger reuses `FileKindIcon`, `baseName` and the button classes.

### D2 — Grouping is a pure function over `sources` and `scan`

`buildLedger(sources, scan, isScanning)` in `ledger.ts` returns `{ groups, fileCount, cueTotal }`. Each group has `kind` (`folder` | `archive`), `location`, `removePaths`, and rows `{ name, cueCount | null, unparsable, removePath | null }`.

- Scan items are bucketed by their new `source` field. The backend has already deduplicated them by resolved path, first occurrence in source order, so a file reachable through several sources appears once.
- A source that is a directory or an archive forms its own group; `removePaths` is that one source.
- Sources that are plain files are grouped by parent folder, in first-added order, as `groupByParent` does; `removePaths` is every such source in the folder, and each row's `removePath` is its own source path.
- Source kind is decided with the existing `fileKind` helper on the source path: `archive` → archive group, `subtitle` → direct file, everything else → folder group. This is a name-only guess, so a dropped `movie.mp4` or a directory whose name ends in `.srt` is grouped as a folder; drag-and-drop is not constrained to the drop-zone kinds, and such inputs are out of scope for this change.
- While `isScanning` (or when `scan` is `null` after a failed scan) rows are derived from `sources` alone: direct files get `cueCount: null`; folder and archive groups have no rows.
- A source that yields no subtitles after the scan still shows its group header with a count of 0, so it can be removed.
- A group whose `removePaths` is empty (the fallback attribution in D3 can produce one) renders no remove button, because removing it would remove nothing.

### D3 — `source` on the scan item is resolved in the backend

`scan_translate_inputs` first deduplicates the resolved subtitle paths, keeping the first occurrence in the order the sources were given, then assigns each found subtitle the first source path that produced it:

1. `collected.archive_origin(path)` when it is an archive entry;
2. otherwise the source equal to the path;
3. otherwise the first directory source that is an ancestor of the path.

The deduplication is what makes "each exactly once" true when a file is added both directly and through its folder, or when folder sources are nested. Because the direct file is normally added first, it wins attribution; if the folder came first, the folder does. The frontend cannot do either job: archive entries live in temp directories whose paths say nothing about the archive.

### D4 — Removal granularity follows what the wizard can actually remove

`onRemoveSources(paths)` already takes source paths. A row gets a remove button only when it is itself a source. Offering a button on files inside a folder would need a per-file exclusion list threaded through scan and plan; the options step already offers per-item selection, so this is left out.

### D5 — Progress comes from an engine `Reporter`

A private `EngineProgressReporter` implements `subx_core::core::report::Reporter`, overriding only `progress`, and is attached with `TranslationEngine::new(..)?.with_reporter(..)`. It matches `ProgressEvent::Translation(..)` and ignores everything else through a wildcard arm (required by `#[non_exhaustive]`, and it keeps the text lines out of the GUI).

One engine serves the whole run, so the reporter holds an `Arc<Mutex<FileProgress>>` that the batch loop resets before each file with the file's index, name, plan item ID, cue count and batch size. On each engine event it updates that state and forwards a full `TranslateProgress` snapshot through the existing `TranslateReporter` seam. The mutex is uncontended: the engine and the loop run on the same single-threaded runtime inside `spawn_blocking`.

The plan item ID must survive the selection filter: `TranslatePlanItem` gains `id: u32`, populated from that item's enumerate index when `preview_translation_impl` builds the plan, and `run_batch` keeps the item whole instead of discarding the queue position. Queue position is not a substitute: deselecting an earlier item renumbers it while the frontend seeds rows from the selected plan IDs.

Rejected: wrapping the `AIProvider` and parsing the `Processed cues` text (the pre-upstream plan). Both depend on engine internals that the new events make explicit.

### D6 — `TranslateProgress` is a full snapshot per event

| Field | Type | Meaning |
|---|---|---|
| `stage` | enum | `terminology`, `translating`, `fillIn`, `writing`, `fileDone`, `finished` |
| `index`, `total`, `fileName` | as today | 1-based file position, file count, display name |
| `itemId` | `u32` | plan item ID of the file (`TranslatePlanItem.id`, the plan's enumerate index) |
| `processedCues`, `totalCues` | `u32` | cue counters for the file |
| `batchSize` | `u32` | configured batch size |
| `batchTotal` | `u32` | batches of the initial pass |
| `batchesDone` | `u32` | initial-pass batches returned |
| `batchInFlight` | `u32` | 1-based batch in flight, `0` when none |
| `resend` | `bool` | the batch in flight is a resend |
| `outcome` | `TranslationStatusDto \| null` | set only on `fileDone` |

A snapshot rather than typed deltas keeps the frontend reducer trivial and makes a dropped channel message harmless. `u64` engine counts are narrowed with `u32::try_from(..).unwrap_or(u32::MAX)`, since no `u64` may cross the IPC boundary. `batchTotal` is `ceil(totalCues / batchSize)` computed from the plan's cue count when the file starts, so the bar can be drawn during the terminology phase; the first `BatchStarted` or `BatchFinished` then replaces it with the engine's `batches`, which is authoritative if the file changed between preview and execution, and `batchesDone` is clamped to it.

Mapping:

| Trigger | Snapshot |
|---|---|
| Batch loop picks a file | `terminology`, counters zero |
| `TerminologyStarted` / `TerminologyFinished` | no extra event (the phase is already shown; nothing visible changes) |
| `BatchStarted { pass: Initial, batch, batches, attempt }` | `translating`, `batchTotal = batches`, `batchInFlight = batch`, `resend = attempt > 1` |
| `BatchFinished { pass: Initial, batch, batches, processed_cues }` | `translating`, `batchTotal = batches`, `batchesDone = min(batch, batches)`, `batchInFlight = 0`, `processedCues` |
| `BatchStarted { pass: FillIn }` | `fillIn`, `batchInFlight = 0` |
| `BatchFinished { pass: FillIn, processed_cues }` | `fillIn`, `processedCues` |
| `translate_subtitle` returned `Ok`, before the write | `writing` |
| File ended (written, failed, skipped, cancelled) | `fileDone` with `outcome` |
| Run ended | `finished` (unchanged) |

`translate_one` gains a callback (or is split) so the command layer can report `writing` between the engine returning and the output being written. A skipped plan item emits `fileDone` with the skipped outcome and no `terminology`. When the cancel signal wins the `select!`, the command loop emits `fileDone { outcome: cancelled }` for the abandoned file, then for every remaining unstarted file, and finally `finished`; the reporter checks the cancel flag before forwarding so an engine event raced with cancellation is dropped.

### D7 — Frontend state is a reducer over snapshots

`progressReducer.ts` exports a pure `reduceProgress(state, event, now)`. State: an ordered map `itemId → { status: waiting | active | done, stage, totalCues, processedCues, batchSize, batchTotal, batchesDone, batchInFlight, resend, startedAt, finishedAt, outcome }`, seeded from the selected plan items when the run starts (including their cue counts), plus `batchDurations: number[]` and `lastBatchStartedAt`.

- A batch duration is recorded when `batchesDone` increases, measured from the last event that put that batch in flight for the first time. A resend does not restart the clock: the user waited for both attempts.
- Estimate = mean of `batchDurations` × remaining initial batches, where remaining = the active file's `batchTotal − batchesDone` plus `ceil(cueCount / batchSize)` for every waiting file. `null` until two durations exist. Fill-in, terminology and writing are not estimated; the estimate is a floor and is labelled as an estimate.
- A snapshot whose `itemId` is not a seeded row is ignored; this covers a skipped item, which the UI never lets the user select, arriving as `fileDone`.
- A cancelled `fileDone` moves the row to done with the cancelled outcome, so the row can be rendered before the run ends.
- `now` is injected so tests are deterministic. `useTranslateWizard` dispatches with `Date.now()` and exposes the reduced state instead of the raw progress value.

### D8 — Bar and in-flight marking without gradients

`BatchProgressBar` renders `batchTotal` flex items whose `flex-grow` is the batch's cue count (the last one `totalCues − (batchTotal − 1) × batchSize`), with `data-state` of `empty`, `inflight`, `resend` or `done`. Fill is `background: var(--ink)`; the in-flight hatch is that fill under a `mask-image` of a small inline SVG, animated by shifting `mask-position` in `steps(4)`. Masks are the one place `flatness.test.ts` allows an image, and the fill colour stays a token. The resend state uses `var(--accent)`. Under `prefers-reduced-motion` the animation is removed in CSS; no timer exists in JS. Segment widths are inline `style` (a `flex-grow` number, not a colour), which the token tests allow.

For a file with very many batches the segments simply get narrow; with a 1px gap and a minimum width of 0 the bar stays within its row. No aggregation is added.

### D9 — One live region

The status line above the rows is the only `role="status"` element for progress in the step. Its text names the current file (`index`, `total`, `fileName`) and the batch position (`batchInFlight` or `batchesDone` of `batchTotal`), so React leaves the node untouched — and assistive technology silent — when a snapshot changes only the cue counter. The run-level `ErrorNotice` must use its default `alert` role in this step, not the current `status` override, so an error cannot create a second polite live region. Elapsed and estimate sit outside the status line. Bars are `aria-hidden`.

### D10 — Dependency bump

`src-tauri/Cargo.toml`: `subx-core = "1.1"`. During development against an unpublished core, a `[patch.crates-io] subx-core = { path = … }` entry may be used locally; it may exist only from task 1.1 until the end of the first task group, which proves it is gone and that `Cargo.lock` resolves `subx-core` at `1.1.x` from the registry.

## Risks / Trade-offs

- **[The core release slips]** → Group 1 of the tasks is the only part that needs it; the ledger work (group 2–3) has no dependency on it and can land first if the change is split.
- **[A scan item matches no source]** (for example a symlinked path) → It falls back to its parent folder as `source`, so it still appears in a folder group; it has no row-level remove button. Covered by a backend test.
- **[Estimate is a floor]** → Labelled as an estimate and withheld until two batches returned; no percentage is shown anywhere.
- **[Mask animation in WebKitGTK]** → `mask-image` is already used by `GroupedFileList`. Row 4 of the visual review checks the hatch in the running desktop app; the static reduced-motion rendering is the fallback if `mask-position` animation misbehaves.
- **[Large source sets make a long single-column list]** → Accepted; `.wizard__content` scrolls and the summary sits at the top. Revisit only if it proves a problem in use.
- **[Bindings drift]** → `npm run bindings:check` in `npm run verify` fails if `bindings.ts` is not regenerated.

## Migration Plan

No persisted data or configuration changes. The IPC shapes change in the same commit series as their only consumer. Rollback is a revert plus restoring `subx-core = "1"`.
