# match-workflow Specification

## ADDED Requirements

### Requirement: Multi-source selection with scan preview and relocation mode

Step 1 of the match wizard SHALL accept multiple sources via drag-and-drop or file browser, where each source may be a folder, an individual video/subtitle file, or a supported archive (expanded via the crate's input handling, which also records each extracted file's archive origin). Step 1 SHALL also offer the relocation mode choice — rename in place / copy / move — defaulting to rename in place. Before any AI call, the wizard SHALL show a scan preview with the number of videos and subtitles discovered. If the sources contain no videos or no subtitles, the wizard SHALL explain this and SHALL NOT allow proceeding.

#### Scenario: Mixed sources are scanned

- **WHEN** the user adds a folder, a standalone subtitle file, and a zip archive and the scan completes
- **THEN** the preview shows the combined video and subtitle counts from all sources, including files found inside the archive

#### Scenario: Insufficient sources block progress

- **WHEN** the scan finds videos but zero subtitles
- **THEN** the wizard shows a localized explanation and the next action remains disabled

#### Scenario: Relocation mode feeds the analysis

- **WHEN** the user selects copy mode in Step 1 and starts the analysis
- **THEN** the resulting plan's operations carry copy relocation, and the review step shows target paths in the videos' directories

### Requirement: Cancellable AI analysis with staged progress

Step 2 SHALL run the AI analysis without blocking the UI, presenting staged progress (scanning → analyzing → finalizing) driven by backend events. The analysis MAY resolve from the crate's persistent match cache without a live AI request; the staged display SHALL remain accurate in that case (no claim of an AI request is made). The user SHALL be able to cancel; cancellation discards the pending analysis and returns to Step 1 without any filesystem changes. Only one analysis SHALL run at a time.

#### Scenario: Stages are reflected

- **WHEN** the analysis progresses through its stages
- **THEN** the UI updates the staged indicator as each backend progress event arrives

#### Scenario: User cancels analysis

- **WHEN** the user cancels during the analyzing stage
- **THEN** the analysis task is aborted, no media files are modified, and the wizard returns to Step 1

#### Scenario: AI provider not configured

- **WHEN** analysis starts while no AI provider is configured
- **THEN** the user sees a localized error with a direct link to the Settings screen

#### Scenario: Concurrent analysis is rejected

- **WHEN** an analysis request arrives while another analysis is still running
- **THEN** the backend rejects it with a dedicated error code and the running analysis is unaffected

### Requirement: Review of the match plan grouped by video

Step 3 SHALL present the analysis result grouped by video: each video with at least one matched subtitle appears as a row listing its matches (one or many, e.g. multiple languages), and each match shows the target subtitle name and path, confidence, and the AI's reasoning (displayed verbatim). Videos with no matched subtitle SHALL appear only in an explicit unmatched-videos section; subtitles matched to no video SHALL appear in an explicit unmatched-subtitles section. Unmatched sets SHALL be computed against the full step-1 scan result (not only from AI-rejected candidates). The canonical plan SHALL remain in backend state; the frontend SHALL reference operations only by identifier.

#### Scenario: Multi-language matches under one video

- **WHEN** the AI matches two subtitles (different languages) to the same video
- **THEN** the review shows both operations as children of that single video row, each with its own confidence and reasoning

#### Scenario: Unmatched items are visible

- **WHEN** the analysis produces no operation for one scanned video and one scanned subtitle
- **THEN** both appear in their respective unmatched sections — even if the AI never mentioned them and even when results came from the crate's cache

### Requirement: Checkbox selection of operations

All proposed operations SHALL start selected. The user SHALL be able to deselect/reselect any operation before execution; only selected operations are executed. When zero operations are selected, the execute action SHALL be disabled. v1 SHALL NOT offer re-assigning a subtitle to a different video.

#### Scenario: Excluding an operation

- **WHEN** the user deselects one of three operations and proceeds to execute
- **THEN** only the two selected operations are executed

#### Scenario: Empty selection blocks execution

- **WHEN** the user deselects all operations
- **THEN** the execute action is disabled until at least one operation is selected

### Requirement: Execution with per-item report

Step 4 SHALL summarize the plan (selected operation count and the relocation mode chosen in Step 1) and execute exactly the selected operations via the crate's audit execution API. Execution SHALL continue past per-item failures and end with a report listing each operation's outcome (success or localized failure reason). Subtitles that were extracted from archives SHALL end up next to their matched video (never inside a temporary extraction directory).

#### Scenario: Copy mode preserves originals

- **WHEN** the user executes selected operations with copy mode chosen in Step 1
- **THEN** renamed subtitle copies appear next to their videos and the original subtitle files remain

#### Scenario: Partial failure does not abort

- **WHEN** one selected operation fails because its subtitle file was deleted after analysis
- **THEN** the remaining operations still execute and the final report shows that item as failed with a localized reason

#### Scenario: Archive-extracted subtitle lands beside the video

- **WHEN** a selected operation's subtitle was extracted from an archive
- **THEN** after execution the subtitle exists in the matched video's directory under its new name

#### Scenario: Stale plan is rejected

- **WHEN** execution is requested for a plan that a newer analysis has replaced
- **THEN** the backend returns a stale-plan error code and the wizard prompts the user to re-run analysis
