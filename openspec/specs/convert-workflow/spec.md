# convert-workflow Specification

## Purpose

The end-to-end GUI conversion flow: multi-source selection and scanning, an output-path preview with conflict handling and per-item selection, and batch execution with per-file progress, cancellation, and a per-item report. The wizard wraps the `subx-cli` crate's `FormatConverter`; the backend owns the canonical plan and the frontend refers to items by identifier only.

## Requirements

### Requirement: Multi-source selection with scan preview

The Convert wizard SHALL accept multiple sources — folders, individual subtitle files, and archives — via drag-and-drop or a browse dialog, and SHALL show a scan preview counting the convertible subtitle files found before any conversion is planned. Archive contents SHALL be included in the scan.

#### Scenario: Mixed sources are scanned

- **WHEN** the user adds a folder, a loose subtitle file, and a zip archive containing subtitles as sources
- **THEN** the scan preview lists the subtitle files found across all sources, including those inside the archive

#### Scenario: No convertible subtitles block progress

- **WHEN** the scan across all sources finds zero subtitle files
- **THEN** the wizard surfaces the `convert.no_subtitles` error state and the next action stays disabled

### Requirement: Conversion options with exact output-path preview

The wizard SHALL let the user choose the target format (srt, ass, vtt, sub), defaulting to the shared configuration's `formats.default_output`, and whether to keep the original files, defaulting to keep. Before execution it SHALL preview the exact resolved output path for every file: next to the input by default, and next to the originating archive for archive-extracted inputs. The preview SHALL flag files whose output already exists as overwrites, and SHALL exclude all but the first of any items resolving to the same output path. No output-encoding option SHALL be offered; input encoding is auto-detected and output is always UTF-8.

#### Scenario: Target format defaults from configuration

- **WHEN** the options step renders and the shared config has `formats.default_output = "vtt"`
- **THEN** the target-format control is preselected to vtt while remaining user-changeable for this run

#### Scenario: Archive-extracted input resolves beside the archive

- **WHEN** the plan is previewed for a subtitle that was extracted from `season1.zip`
- **THEN** its output path is shown in the directory containing `season1.zip`, not in a temporary extraction directory

#### Scenario: Existing output is flagged

- **WHEN** a planned output path already exists on disk
- **THEN** the preview marks that item as an overwrite so the user can deselect it before executing

#### Scenario: Input already in the target format is auto-excluded

- **WHEN** an input file's format equals the target format, so its resolved output path is the input path itself
- **THEN** the item is shown as skipped and excluded from execution — without also being flagged as an overwrite — and converting it is not possible

#### Scenario: Colliding output paths are excluded

- **WHEN** two inputs (e.g. `a.srt` and `a.ass`) resolve to the same output path for the chosen target format
- **THEN** only the first is executable and the others are flagged with `convert.output_collision` and excluded, so no item silently overwrites another's freshly written output

### Requirement: Per-item selection

Every previewed conversion SHALL start selected (except auto-excluded same-format items), with a per-item checkbox to exclude it. Executing with an empty selection SHALL be blocked in the UI.

#### Scenario: Excluding an item

- **WHEN** the user unchecks one previewed conversion and proceeds
- **THEN** only the remaining selected items are converted and the excluded file is untouched

#### Scenario: Empty selection blocks execution

- **WHEN** every item is deselected
- **THEN** the execute action is disabled

### Requirement: Batch execution with progress, cancellation, and per-item report

Execution SHALL convert the selected items one by one, reporting per-file progress (current index, total, current file name) over an IPC channel. A per-item failure SHALL NOT abort the batch; it is collected and reported. Cancellation SHALL stop before the next file begins, leaving already-written outputs in place, and the final report SHALL list every item's outcome. When keep-original is off, the input file SHALL be removed only after its conversion succeeded. An output file SHALL only ever contain a complete, validated conversion result: a failed conversion never replaces existing content at its output path.

#### Scenario: Per-file progress is reported

- **WHEN** a batch of N selected files is executing
- **THEN** the UI shows progress advancing through each file as index-of-total with the current file name

#### Scenario: Per-item failure does not abort

- **WHEN** one file in the batch fails to parse
- **THEN** the remaining files are still converted and the report shows that item as failed with its error and the others as succeeded

#### Scenario: Cancellation stops between files

- **WHEN** the user cancels mid-batch
- **THEN** no further files are started, already-completed outputs remain on disk, and the report reflects the completed and unprocessed items

#### Scenario: Delete-original only after success

- **WHEN** keep-original is off and a file's conversion fails
- **THEN** that input file is not deleted, while successfully converted inputs are removed

#### Scenario: A failed conversion never clobbers an existing output

- **WHEN** an item targeting an existing output file fails conversion or its output validation
- **THEN** the pre-existing file at that path is left with its original content intact

#### Scenario: Stale plan is rejected

- **WHEN** execution is requested for a plan ID that is no longer the active plan
- **THEN** the command fails with `convert.stale_plan` and the UI returns to the sources step
