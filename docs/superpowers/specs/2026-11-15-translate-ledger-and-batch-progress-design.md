# Translate Sources Ledger and Batch Progress — Design

Date: 2026-11-15
Status: approved in brainstorming; not yet proposed as an OpenSpec change

## Goal

Fix two problems in the translate wizard:

1. **Step 01 (sources) shows the same files twice.** The added-sources list and
   the scan-result list are stacked, and the owner found that confusing. Merge
   them into one list.
2. **Step 03 (translate) shows almost nothing while it runs.** It reports only
   "file i of n" and elapsed seconds. Replace it with a progress display that
   is driven by real engine events.

Reference mockup (not shipped):
`.superpowers/brainstorm/760190-1794750109/content/translate-redesign.html`.
The owner chose option `sources-a` ("分組帳本") and option `run-a`
("批次校樣"), without the terminology strip.

## Decisions

| Topic | Decision |
|---|---|
| Sources layout | One single-column ledger grouped by source location |
| Run layout | One row per file with a bar segmented by real AI batches |
| Terminology strip | Not built |
| Token usage, translated-text preview | Not built |
| `subx-core` | No change required; `subx-core` 1.0.1 already exposes what is needed |
| Progress honesty | The display advances only on real events; no interpolated percentage |
| Unparsable files | Behaviour unchanged: flagged in step 01, excluded in step 02, never block "繼續" |
| Cancellation | Behaviour unchanged: the file in flight is abandoned unwritten |

## Part 1 — Sources ledger (step 01)

### Layout

The drop zone stays as it is. Below it, one list replaces `GroupedFileList`
plus the `translate-sources__files` list.

- **Summary row**, at the top of the list: "共 5 個檔案 · 1,551 句字幕". An
  unparsable file counts as a file and contributes no cues. While scanning, the
  row reads "掃描中……" instead of a total.
- **Group** = one source location:
  - a parent folder, for subtitle files added directly (several files from the
    same folder share one group, as `groupByParent` does today);
  - a folder source;
  - an archive source.
- **Group header**: kind icon (folder or archive), the location path truncated
  from the start so the last segment stays visible, the full path in `title`,
  file count, cue subtotal, and a "移除" button.
- **Row**: kind icon, file name in mono, and on the right either the cue count
  in tabular numerals or a "⚠ 無法解析" flag. The flag is text plus an icon,
  never colour alone.

### Removal

- A group's "移除" removes every source path that belongs to the group.
- A row shows a hover/focus "✕" only when the row is itself a source path (a
  directly added file). Rows found inside a folder or archive source have no
  "✕": the wizard has no per-file exclusion at this step, and step 02 already
  offers per-item selection.

### Scanning state

The scan returns all files at once, so while `isScanning` is true:

- Directly added files are known from `sources`: show their rows with a
  placeholder in the count column.
- Folder and archive sources show only their group header with "掃描中……" in
  place of the file count and subtotal.
- Under reduced motion the placeholder is static.

When the scan fails, `ErrorNotice` shows below the list as it does today, and
the ledger keeps the rows it can derive from `sources`.

### Backend change

`TranslateScanItemDto` gains one field, `source: String`: the source path the
user added that produced this file (the file's own path for a directly added
file, the folder path for a folder source, the archive path for an archive
source). The frontend groups by it. `list_translate_inputs` already resolves
inputs per source, so this is bookkeeping, not a new scan.

### Components

- New `TranslateSourceLedger` component in `src/features/translate/`. It takes
  `sources`, `scan`, `isScanning` and `onRemoveSources`, and owns grouping,
  subtotals and the summary row. Grouping is a pure function in its own file
  with unit tests.
- `GroupedFileList` is left untouched; convert, sync and match still use it.
- `TranslateSourcesStep` shrinks to the drop zone, the ledger and the error
  notice.

## Part 2 — Batch progress (step 03)

### What the engine reports

Per file, `TranslationEngine::translate_subtitle` issues:

1. one terminology request;
2. one translation request per batch of `translation.batch_size` cues
   (default 40), so a 378-cue file is 10 batches, the last one 18 cues;
3. at most one extra translation request when a batch response carried an
   unknown cue ID (the batch is discarded and resent once);
4. one fill-in request after all batches when some cues came back missing.

There is no token streaming. Progress moves in batch-sized steps several
seconds apart.

### Layout

One row per selected file, in plan order:

- **Waiting**: a muted single line with the file name and cue count.
- **Active**: file name, phase label, segmented bar, "120 / 378 句" in tabular
  numerals.
- **Done**: collapsed to "完成 ✓ · 378 句 · 1:37".
- **Failed / cancelled**: collapsed, with a text marker. Details stay in the
  step 04 report.

Above the rows: one status line ("正在翻譯第 1 / 2 個檔案 · 翻譯第 6 / 10
批"), elapsed time, and estimated time remaining.

**Segmented bar.** Segment count is `ceil(cues / batch_size)`; each segment's
width is proportional to its cue count. A returned batch is filled with ink.
The batch in flight shows a marching hatch. During a resend the hatch uses the
accent colour and a one-line notice appears. The hatch is built without
gradients, shadows or `color-mix`, so `flatness.test.ts` keeps passing.

**Phase label.** 擷取專有名詞 → 翻譯第 3 / 10 批 → 補譯缺漏 → 寫入中 → 完成.
During the terminology and writing phases no segment is in flight.

**Estimated time remaining.** Computed from the mean duration of returned
batches across the run, multiplied by the batches left in all selected files.
It reads "估算中" until two batches have returned, and is recomputed only when
a batch returns.

### Accessibility and motion

- The status line is the only live region (`role="status"`). It changes when
  the file, the phase or the batch number changes, never more often.
- The bars are `aria-hidden`.
- Under `prefers-reduced-motion` the hatch is static; numbers and fills still
  update. Use the existing `usePrefersReducedMotion` hook where logic needs it.

### Backend: collecting the events

All of this lives in `src-tauri/src/commands/translate.rs`; `subx-core` is not
modified.

1. **Observing provider.** Wrap the `Arc<dyn AIProvider>` the factory returns
   in a decorator that forwards every method and, around `chat_completion`,
   reports "request sent" and "request returned". It classifies a request by
   comparing its system message with the public
   `TERMINOLOGY_SYSTEM_MESSAGE` / `TRANSLATION_SYSTEM_MESSAGE` constants.
2. **Engine reporter.** Attach a `Reporter` with
   `TranslationEngine::with_reporter`. After each batch the engine emits
   `ProgressEvent::Message` containing "Processed cues: X/Y". Parse the two
   numbers; this is the authoritative processed-cue count.
3. **Fallback.** The message is free-form text. If it does not parse, estimate
   the count as `min(returned_batches × batch_size, total)`. The bar stays
   correct; only the cue counter may be slightly off for a file with missing
   cues. A unit test pins the current message format so a `subx-core` upgrade
   that changes it fails loudly.
4. **Resend detection.** The engine emits its progress message after every
   batch, including one that added no cues. A translation request sent when
   no progress message has arrived since the previous translation request was
   sent is therefore a resend of the same batch. Comparing cue counts instead
   would misread a batch whose cues all came back missing.
5. **Fill-in detection.** A translation request sent after
   `ceil(cues / batch_size)` progress messages have arrived is the fill-in
   pass.
6. **Writing.** The command layer reports the writing phase itself, between
   `translate_subtitle` returning and the output being written.

Both observers report through the existing `TranslateReporter` seam, so tests
keep running without a channel. Because one engine serves the whole batch, the
observers read the current file's position from shared state that the batch
loop updates before each file.

### IPC contract

`TranslateProgress` grows from file-level to batch-level. All counters are
`u32` (no `u64` may cross the boundary).

| Field | Meaning |
|---|---|
| `stage` | `terminology`, `translating`, `fillIn`, `writing`, `fileDone`, `finished` |
| `index`, `total`, `fileName` | Unchanged: 1-based file position, file count, display name |
| `itemId` | Plan item ID of the file, so the frontend can key rows |
| `processedCues`, `totalCues` | Cue counters for the current file |
| `batchIndex`, `batchTotal` | 1-based batch in flight, and batch count; `batchIndex` is 0 outside `translating` |
| `batchSize` | Configured batch size, for segment widths |
| `inFlight` | `true` between "request sent" and "request returned" |
| `resend` | `true` while the batch in flight is a resend |

`fileDone` is emitted once per file after it is written, fails or is skipped,
so a row can collapse without waiting for the next file to start. `finished`
keeps its current meaning. `src/types/bindings.ts` is regenerated with
`npm run bindings:generate`.

### Frontend state

`useTranslateWizard` currently keeps the latest `TranslateProgress`. It will
instead reduce progress events into a per-file map (status, processed cues,
batch in flight, resend flag, started/finished timestamps) plus the list of
returned-batch durations for the estimate. The reducer is a pure function with
its own tests. `TranslateRunStep` renders from that state; a new
`BatchProgressBar` component draws one file's segments.

## Error handling

- Progress stays best-effort: a failed channel send never fails the batch.
- A file that fails mid-way emits `fileDone`; its row collapses to the failed
  marker and the batch continues, as today.
- After cancellation no further progress events are emitted except the final
  `finished`.
- A provider that fails the terminology request fails the file before any
  segment fills; the row goes straight from 擷取專有名詞 to failed.

## Testing

Backend (scripted provider, recording reporter):

- event order for a clean file: terminology → each batch sent/returned →
  writing → fileDone;
- processed-cue counts match the engine's messages;
- a scripted unknown-cue-ID response yields a `resend` event and no extra
  segment;
- a scripted missing-cue response yields a `fillIn` stage;
- the message-format pin test, and the fallback path when parsing fails;
- no events after cancellation other than `finished`;
- `source` is correct for file, folder and archive sources.

Frontend:

- ledger grouping, subtotals, summary row, unparsable flag, scanning state;
- "✕" only on directly added rows; group removal passes every path;
- progress reducer: state transitions, resend, fill-in, estimate needing two
  batches;
- segment count and proportional widths, including a short last batch;
- reduced-motion rendering.

Specs: update `openspec/specs/translate-workflow/spec.md` through an OpenSpec
change. The requirement "batch execution with per-file progress, cancellation
and per-item report" changes to batch-level progress, and the sources
requirement changes to a single list. Every new scenario gets a `// @covers`
annotation on an active test. `npm run verify` must pass.

## Out of scope

- Terminology strip, token usage, translated-text preview.
- Per-file exclusion inside a folder or archive source at step 01.
- Collapsible groups or virtual scrolling for very large source sets;
  `.wizard__content` remains the scroller.
- A structured batch-progress event in `subx-core`. It would remove the string
  parsing in "Engine reporter" above and can be requested upstream later; this
  design does not depend on it.

## Delivery

One OpenSpec change is enough; the two parts share the scan and progress DTOs
and the same spec. If it proves larger than a workday, split it into
`merge-translate-source-lists` and `show-translate-batch-progress`, in that
order.
