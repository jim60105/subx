# Spec Delta

## MODIFIED Requirements

### Requirement: Multi-source selection with cue-count preview

The Translate wizard SHALL accept multiple sources — folders, individual subtitle files, and archives — via drag-and-drop or a browse dialog, and SHALL show the subtitle files the scan found in a single list, each exactly once with its cue count, so the user can gauge the size of the AI job before any request is sent. When the same file is reachable through more than one source, it SHALL be listed once and attributed to the first source that produced it. Unparsable files SHALL be listed as such rather than silently dropped.

#### Scenario: Mixed sources are scanned with cue counts

- **WHEN** the user adds a folder, a loose subtitle file, and a zip archive containing subtitles as sources
- **THEN** the scan preview lists every subtitle found across all sources, each with its parsed cue count

#### Scenario: Scanning does not require a target language

- **WHEN** sources are added while no target language has been chosen and the shared configuration sets no `translation.default_target_language`
- **THEN** the scan still lists the subtitles found with their cue counts, because the target language is only asked for on the options step

#### Scenario: No subtitles block progress

- **WHEN** the scan across all sources finds zero subtitle files
- **THEN** the wizard surfaces the `translate.no_subtitles` error state and the next action stays disabled

#### Scenario: Unparsable file is flagged and excluded

- **WHEN** the scan finds a subtitle file that cannot be parsed
- **THEN** the file is listed with the `translate.unparsable` flag, excluded from execution, and the parsable files remain translatable

#### Scenario: Each found subtitle is listed once

- **WHEN** two subtitle files are added directly and the scan completes
- **THEN** the sources step contains exactly one list, and each of the two file names appears in it exactly once

#### Scenario: A file reachable through two sources is listed once

- **WHEN** a folder and one of the subtitle files inside it are both added as sources and the scan completes
- **THEN** the sources step lists that file once, attributed to the directly added file, and the summary counts it once

#### Scenario: Each scan item names its source

- **WHEN** the scan runs over a directly added file, a folder source and an archive source
- **THEN** each returned item carries the path of the source the user added that produced it: the file's own path, the folder's path, and the archive's path respectively

### Requirement: Translate sources step demonstrates accepted inputs

The Translate sources step SHALL present its accepted inputs through the shared source-intake drop zone — folder, subtitle, and archive, and no video kind — and SHALL list what was found in groups by source location, from which a whole group can be removed and a directly added file can be removed on its own. The sentence describing the accepted inputs SHALL remain available to assistive technology only.

#### Scenario: Drop zone shows the kinds Translate accepts

- **WHEN** the Translate sources step renders with no sources
- **THEN** the drop zone shows folder, subtitle, and archive glyphs, shows no video glyph, and the descriptive sentence is present only as visually hidden text

#### Scenario: Removing a folder group rescans without it

- **WHEN** two sources from one folder and one from another are listed and the user removes the first folder's group
- **THEN** only the other folder's source remains listed and the scan is requested again for exactly that source

#### Scenario: A directly added file can be removed on its own

- **WHEN** two subtitle files from one folder were added directly and the user removes one of them
- **THEN** the other file remains listed and the scan is requested again for exactly that file

#### Scenario: Files inside a folder or archive source have no remove action

- **WHEN** a folder source and an archive source are listed with the files found inside them
- **THEN** each of those groups offers a remove action for the whole group and none of its file rows offers one

### Requirement: Batch execution with per-file progress, cancellation, and per-item report

Execution SHALL translate the selected items one by one, reporting progress over an IPC channel: the current file's index, total and name, plus the batch-level detail required by *Batch-level progress reporting*. The run display SHALL list every selected file as a row and SHALL show the current file in a status line. A per-file failure SHALL NOT abort the batch. Cancellation SHALL stop the run, leaving already-written outputs in place; the file in flight when cancellation lands is abandoned unwritten, and the abandoned file and every file that never started SHALL be reported with the cancelled outcome before the final finished event. The final report SHALL list every item's outcome. Translation SHALL preserve cue timing and count.

#### Scenario: Per-file progress is reported

- **WHEN** a batch of N selected files is translating
- **THEN** the UI shows progress advancing through each file as index-of-total with the current file name

#### Scenario: Per-file failure does not abort

- **WHEN** the AI response for one file fails validation
- **THEN** the remaining files are still translated and the report shows that item as failed with its error code and the others as succeeded

#### Scenario: Cancellation abandons only unfinished work

- **WHEN** the user cancels while file k of N is being translated
- **THEN** files 1..k-1 remain written on disk, file k is not written, no further files start, and the report reflects this

#### Scenario: Timing survives translation

- **WHEN** a subtitle is translated end to end through the wizard
- **THEN** the output has the same cue count with each cue's start and end times unchanged from the input

#### Scenario: AI provider not configured

- **WHEN** translation is started without a configured AI provider
- **THEN** the wizard surfaces `translate.ai_not_configured` with a hint linking to the Settings screen

#### Scenario: Stale plan is rejected

- **WHEN** execution is requested for a plan ID that is no longer the active plan
- **THEN** the command fails with `translate.stale_plan` and the UI returns to the sources step

## ADDED Requirements

### Requirement: Sources ledger groups and totals

The sources list SHALL group found subtitles by source location: the parent folder of directly added files, a folder source, or an archive source. Each group header SHALL show the location, its file count and its cue subtotal. A summary SHALL show the total file count and total cue count. An unparsable file SHALL count as a file and contribute no cues.

#### Scenario: Files from one folder share a group

- **WHEN** two subtitle files from the same folder were added directly, with 378 and 372 cues
- **THEN** they appear under one group whose header shows that folder, a count of 2 and a subtotal of 750 cues

#### Scenario: An archive source is its own group

- **WHEN** an archive source yields three subtitles
- **THEN** they appear under a group whose header shows the archive and an archive glyph, separate from any folder group

#### Scenario: Summary excludes unparsable files from the cue total

- **WHEN** the scan found four parsable files totalling 1,551 cues and one unparsable file
- **THEN** the summary shows 5 files and 1,551 cues, and the unparsable row shows its flag as text, not as colour alone

### Requirement: Sources ledger scanning state

While the scan is running the sources list SHALL stay visible. A directly added file SHALL show its row with a placeholder where the cue count will appear. A folder or archive source SHALL show its group header with a scanning indication and no file rows. The summary SHALL show a scanning indication and no totals.

#### Scenario: Directly added files show a placeholder count

- **WHEN** a subtitle file has been added and the scan has not returned
- **THEN** its row is listed with a placeholder in place of the cue count and the summary shows no total

#### Scenario: A folder source shows only its header while scanning

- **WHEN** a folder source has been added and the scan has not returned
- **THEN** its group header is listed with a scanning indication and no file rows

#### Scenario: A failed scan keeps the list

- **WHEN** the scan fails after sources were added
- **THEN** the scan error is shown and the sources remain listed so they can be removed

### Requirement: Batch-level progress reporting

During execution the backend SHALL report, for the file in flight, its phase — terminology, translating, fill-in, writing — together with processed and total cue counts, the number of batches, how many have returned, which batch is in flight, and whether that batch is being resent. The batch index, count, resend flag and cue counts SHALL come from the engine's structured events; the command layer reports terminology and writing.

#### Scenario: A clean file reports its phases in order

- **WHEN** a 250-cue file is translated with a batch size of 100 and every cue returns
- **THEN** the reported progress for that file is, in order: terminology, then for batches 1 to 3 a batch in flight followed by that batch returned with processed cues of 100, 200 and 250, then writing, then file completion with the translated outcome

#### Scenario: A resent batch is flagged

- **WHEN** a batch response is discarded for an unknown cue ID and the batch is sent again
- **THEN** progress reports the same batch in flight with the resend flag set, and the count of returned batches does not change until the resend returns

#### Scenario: The fill-in pass is reported as its own phase

- **WHEN** cues are still missing after every batch has returned
- **THEN** progress reports the fill-in phase with every batch returned and no batch in flight, and afterwards a processed count equal to the total

### Requirement: Per-file completion reporting

When a file ends, the backend SHALL report its completion with its outcome. On cancellation it SHALL report the abandoned file and every file that never started with the cancelled outcome before the final finished event.

#### Scenario: A failed file reports completion and the batch continues

- **WHEN** the terminology request of the first of two files fails
- **THEN** progress reports that file's completion with the failed outcome and then the terminology phase of the second file

#### Scenario: Cancellation stops progress

- **WHEN** the user cancels while a batch is in flight
- **THEN** no further phase or batch progress is reported for the abandoned file, the abandoned file and every file that never started are reported complete with the cancelled outcome, and the final finished event follows

### Requirement: Run step shows one row per file

The run step SHALL list every selected file in plan order. A file not yet started SHALL show as a waiting line with its cue count; the file in flight SHALL show its phase, a segmented bar and a processed-of-total cue counter; a finished file SHALL collapse to one line stating its outcome, cue count and duration. A failed or cancelled file SHALL state so in text.

#### Scenario: Waiting, active and finished rows

- **WHEN** the first of three selected files has finished and the second is translating
- **THEN** the first row shows a completed line with its cue count and duration, the second shows a phase label, a bar and a cue counter, and the third shows a waiting line

#### Scenario: A failed file is marked in text

- **WHEN** progress reports a file's completion with the failed outcome
- **THEN** its row collapses to a line carrying a failure marker as text and the next file's row becomes active

### Requirement: Segmented bar mirrors real batches

The active file's bar SHALL have one segment per batch of the initial pass, each as wide as its share of the file's cues. A returned batch's segment SHALL be filled, the batch in flight SHALL be marked as in flight, and a resend SHALL be marked distinctly and accompanied by a notice. The bar SHALL change only when a progress event arrives; it SHALL NOT interpolate between events.

#### Scenario: Segment count and widths follow the batches

- **WHEN** a 378-cue file is in flight with a batch size of 40
- **THEN** its bar has 10 segments, the first nine equally wide and the tenth 18/40 of their width

#### Scenario: Returned and in-flight segments

- **WHEN** progress reports 5 batches returned and batch 6 in flight
- **THEN** segments 1 to 5 are filled, segment 6 is marked in flight, and segments 7 to 10 are empty

#### Scenario: A resend is marked and announced

- **WHEN** progress reports batch 6 in flight with the resend flag set
- **THEN** segment 6 carries the resend marking and a resend notice is shown

#### Scenario: No segment is in flight outside the translating phase

- **WHEN** the file in flight is in the terminology, fill-in or writing phase
- **THEN** no segment is marked in flight and the phase label names that phase

### Requirement: Elapsed and estimated remaining time

The run step SHALL show the elapsed time of the run and an estimate of the time remaining. The estimate SHALL be derived from the durations of returned batches and the batches left across all selected files, SHALL be recomputed only when a batch returns, and SHALL read as not yet available until two batches have returned.

#### Scenario: Estimate waits for two batches

- **WHEN** one batch has returned
- **THEN** the estimate reads as still being worked out, and after the second batch returns it shows a duration

#### Scenario: Estimate covers the waiting files

- **WHEN** two batches have returned in 4 seconds each, 8 batches remain in the active file and a waiting file needs 10 batches
- **THEN** the estimate is 72 seconds

### Requirement: Run step progress is accessible and honours reduced motion

The run step SHALL expose at most one polite live status line for progress, naming the current file position and batch position, that changes only when the file, the phase or the batch number changes; a run-level error SHALL use an assertive alert role instead of a second status line. The bars SHALL be hidden from assistive technology. When the user prefers reduced motion, the in-flight marking SHALL be static while fills, counters and labels still update.

#### Scenario: One status line carries the progress

- **WHEN** batch 6 of 10 of the first of two files is in flight
- **THEN** exactly one element with the status role names the file position and the batch position, and every bar is hidden from assistive technology

#### Scenario: Reduced motion keeps the information

- **WHEN** the user prefers reduced motion and a batch returns
- **THEN** the returned segment is filled and the counter updates, and the in-flight segment declares no animation
