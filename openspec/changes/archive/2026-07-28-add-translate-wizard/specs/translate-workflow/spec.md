# translate-workflow Delta

## ADDED Requirements

### Requirement: Multi-source selection with cue-count preview

The Translate wizard SHALL accept multiple sources — folders, individual subtitle files, and archives — via drag-and-drop or a browse dialog, and SHALL show a scan preview listing the subtitle files found with a per-file cue count, so the user can gauge the size of the AI job before any request is sent. Unparsable files SHALL be listed as such rather than silently dropped.

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

### Requirement: Translation options seeded from shared configuration

The options step SHALL require a target language, prefilled from the shared configuration's `translation.default_target_language` when set; without a target language the wizard SHALL NOT proceed. Optional inputs SHALL include a source language, a free-text context, and a glossary entered as `source = target` (or `source -> target`) lines whose entries steer the translation.

#### Scenario: Target language prefilled from configuration

- **WHEN** the options step renders and the shared config has `translation.default_target_language = "zh-TW"`
- **THEN** the target-language input shows `zh-TW` while remaining user-changeable for this run

#### Scenario: Missing target language blocks progress

- **WHEN** no target language is set in the configuration and the user leaves the field empty
- **THEN** the wizard surfaces `translate.no_target_language` and the next action stays disabled

#### Scenario: Glossary lines reach the translation request

- **WHEN** the user enters `Alice = 愛麗絲` in the glossary field and starts translation
- **THEN** the backend passes the parsed glossary entry to the translation engine's request for every file

### Requirement: Output resolution with conflict handling

The plan SHALL resolve each file's output before execution: by default `<stem>.<target-language>.<ext>` beside the input — beside the originating archive for archive-extracted files — or, in replace mode, the input path itself. Replace mode SHALL be refused for archive-extracted subtitles and SHALL create a backup copy before overwriting when the shared configuration's `general.backup_enabled` is on. In suffix mode, an item whose output already exists SHALL be flagged and excluded from execution unless the user enables overwriting. When two planned items resolve to the same output path, all but the first SHALL be flagged as colliding and excluded from execution.

#### Scenario: Default suffix naming

- **WHEN** `movie.srt` is translated to `zh-TW` in suffix mode
- **THEN** the planned output is `movie.zh-TW.srt` in the same directory

#### Scenario: Archive-extracted output lands beside the archive

- **WHEN** a subtitle extracted from `season1.zip` is translated in suffix mode
- **THEN** its planned output is in the directory containing `season1.zip`, not in a temporary extraction directory

#### Scenario: Replace mode is refused for archive-extracted files

- **WHEN** replace mode is selected and the plan contains a subtitle that came out of an archive
- **THEN** that item is flagged with `translate.replace_archive_forbidden` and excluded from execution

#### Scenario: Replace mode backs up when enabled

- **WHEN** replace mode runs on `movie.srt` with `general.backup_enabled = true`
- **THEN** a backup copy (`movie.srt.backup`) exists after translation and `movie.srt` contains the translated text

#### Scenario: Existing output is excluded unless overwrite is enabled

- **WHEN** a suffix-mode item's planned output already exists and the overwrite toggle is off
- **THEN** the item is flagged and excluded from execution; enabling overwrite re-includes it

#### Scenario: Colliding output paths are excluded

- **WHEN** two archive-extracted subtitles sharing a basename resolve to the same beside-the-archive output path
- **THEN** only the first is executable and the others are flagged with `translate.output_collision` and excluded, so no item silently overwrites another's freshly written translation

### Requirement: Batch execution with per-file progress, cancellation, and per-item report

Execution SHALL translate the selected items one by one, reporting per-file progress (current index, total, current file name) over an IPC channel. A per-file failure SHALL NOT abort the batch. Cancellation SHALL stop the run, leaving already-written outputs in place; the file in flight when cancellation lands is abandoned unwritten. The final report SHALL list every item's outcome. Translation SHALL preserve cue timing and count.

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
