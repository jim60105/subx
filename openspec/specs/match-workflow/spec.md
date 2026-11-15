# match-workflow Specification

## Purpose

The end-to-end GUI match flow: multi-source selection and scanning, cancellable AI analysis with staged progress, review of an operation plan (grouped by video, confidence-annotated, checkbox-selectable) with explicit unmatched sections, and selective execution with per-item reporting. The wizard wraps the `subx-core` crate's `MatchEngine`; the backend owns the canonical plan and the frontend refers to operations by identifier only.

## Requirements

### Requirement: Multi-source selection with scan preview and relocation mode

Step 1 SHALL accept folders, video/subtitle files, and archives (expanded by the crate, recording each file's archive origin) via drag-and-drop or browser, and offer the relocation choice rename in place / copy / move, defaulting to rename in place. Before any AI call it SHALL show a scan preview of videos and subtitles found, and SHALL explain and block proceeding when either is missing. Only the source list SHALL scroll, and each relocation option SHALL demonstrate its effect as a diff.

#### Scenario: Mixed sources are scanned

- **WHEN** the user adds a folder, a standalone subtitle file, and a zip archive and the scan completes
- **THEN** the preview shows the combined video and subtitle counts from all sources, including files found inside the archive

#### Scenario: Insufficient sources block progress

- **WHEN** the scan finds videos but zero subtitles
- **THEN** the wizard shows a localized explanation and the next action remains disabled

#### Scenario: Relocation mode feeds the analysis

- **WHEN** the user selects copy mode in Step 1 and starts the analysis
- **THEN** the resulting plan's operations carry copy relocation, and the review step shows target paths in the videos' directories

#### Scenario: Relocation choice stays outside the scrolling list

- **WHEN** Step 1 lists far more sources than fit the window
- **THEN** the relocation choice is rendered outside the step's only scrolling region, which contains the source list and nothing else

#### Scenario: Each relocation option demonstrates its effect

- **WHEN** Step 1 renders the relocation choice
- **THEN** the rename option shows one removed and one created line, the copy option one kept and one created line, and the move option one removed and one created line, and each option's explanatory sentence is its accessible description rather than visible text

### Requirement: Cancellable AI analysis with staged progress

Step 2 SHALL run the AI analysis without blocking the UI, presenting staged progress (scanning → analyzing → finalizing) driven by backend progress messages. The analysis MAY resolve from the crate's persistent match cache without a live AI request; the staged display SHALL remain accurate in that case (no claim of an AI request is made). The user SHALL be able to cancel; cancellation discards the pending analysis and returns to Step 1 without any filesystem changes. Only one analysis SHALL run at a time.

#### Scenario: Stages are reflected

- **WHEN** the analysis progresses through its stages
- **THEN** the UI updates the staged indicator as each backend progress message arrives

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

Step 3 SHALL present the analysis result as a ledger, one row per pairing in plan (video) order, never re-sorted, naming each video once. Rows show the subtitle name, language tag, and resulting file name. Confidence SHALL appear only below 80, with the AI's reasoning verbatim; other rows offer it on demand. Unmatched videos and subtitles, computed against the full step-1 scan, SHALL follow. The plan SHALL stay in backend state; the frontend SHALL reference operations only by identifier.

#### Scenario: Multi-language matches under one video

- **WHEN** the AI matches two subtitles (different languages) to the same video
- **THEN** the review shows both operations under that single video, each carrying its own confidence and reasoning

#### Scenario: Unmatched items are visible

- **WHEN** the analysis produces no operation for one scanned video and one scanned subtitle
- **THEN** both appear in the review as unmatched entries — even if the AI never mentioned them and even when results came from the crate's cache

#### Scenario: Rows keep plan order regardless of confidence

- **WHEN** the plan's pairings carry confidences 96, 52, and 98 in that order
- **THEN** the ledger lists them in exactly that order

#### Scenario: A repeated video name is omitted

- **WHEN** a video has two pairings
- **THEN** the first of its rows displays the video name and the second does not display it again, while the name stays available to assistive technology on both rows

#### Scenario: Confidence is shown only below the threshold

- **WHEN** the ledger renders one pairing with confidence 79 and one with confidence 80
- **THEN** the first row is marked as needing review and shows a meter, its confidence figure, and its reasoning without any interaction, and the second row shows neither a meter nor a confidence figure

#### Scenario: Reasoning of a confident row is available on demand

- **WHEN** a pairing with confidence 80 or above has reasoning
- **THEN** its reasoning is collapsed behind a disclosure the user can open, and it is shown verbatim once opened

#### Scenario: Unmatched entries show an empty slot on the missing side

- **WHEN** the plan has one unmatched video and one unmatched subtitle
- **THEN** each appears as a ledger row after every pairing, without a checkbox, with a labelled empty slot where the subtitle or the video is missing

### Requirement: Checkbox selection of operations

All proposed operations SHALL start selected. The user SHALL be able to deselect/reselect any operation before execution; only selected operations are executed. When zero operations are selected, the execute action SHALL be disabled. v1 SHALL NOT offer re-assigning a subtitle to a different video.

#### Scenario: Excluding an operation

- **WHEN** the user deselects one of three operations and proceeds to execute
- **THEN** only the two selected operations are executed

#### Scenario: Empty selection blocks execution

- **WHEN** the user deselects all operations
- **THEN** the execute action is disabled until at least one operation is selected

### Requirement: Language quick-select on review

The match review step SHALL show a quick-select bar above the operation list whenever the plan has at least one operation, including when all its operations fall into a single group. The bar has one control per subtitle language present in the plan, derived from a per-operation language code the backend attaches by detecting the language from the subtitle file's path (at most one code per operation); operations whose language cannot be detected form a single `Other` group. Each control shows its group's localized display name and the number of operations in the group, indicates a checked state while every operation of its group is selected and an indeterminate state while only some are, and is labelled for assistive technology by an explicit accessible name rather than by concatenating visible fragments. Activating a control selects every operation of its group when any of them is currently unselected (including the fully-cleared case, which reads as unchecked), and clears every operation of its group when all of them are currently selected. The controls SHALL stay in sync with the per-operation checkboxes in both directions, SHALL only change checkbox selection (never hide, reorder, or filter the listed operations), and SHALL leave the rule that the execute action is disabled while zero operations are selected unchanged.

#### Scenario: Quick-select bar reflects the languages actually present

- **WHEN** the review step renders a plan whose operations cover two Simplified Chinese subtitles, one Traditional Chinese subtitle, one English subtitle, and one subtitle whose language cannot be detected
- **THEN** the bar shows exactly one control per present group — the localized names for Simplified, Traditional, and English plus the `Other` control — each showing its group's operation count, and no control for a language absent from the plan

#### Scenario: Selecting a language selects all of its files

- **WHEN** the user activates the Traditional Chinese control while some — or none — of the Traditional Chinese operations are selected
- **THEN** every Traditional Chinese operation becomes selected, every other operation's selection is untouched, and the selected count updates

#### Scenario: Clearing a language clears only its files

- **WHEN** the user activates the Simplified Chinese control while all Simplified Chinese operations are selected
- **THEN** every Simplified Chinese operation becomes unselected and operations of other languages keep whatever selection they had

#### Scenario: Chips follow manual checkbox changes

- **WHEN** the user manually unchecks the last selected operation of a language via its row checkbox
- **THEN** that language's control shows the cleared state without any activation of the control itself

#### Scenario: All-unknown languages still get one control

- **WHEN** the plan's operations all carry an undetectable language
- **THEN** the bar shows a single `Other` control whose activation selects/clears every operation, and no language chips

#### Scenario: Quick-clear to zero blocks execution

- **WHEN** the user clears the last language group that still had a selected operation
- **THEN** the execute action is disabled until some operation is selected again, exactly as with manual deselection

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

### Requirement: Review filters narrow the ledger without changing selection

The review step SHALL offer three filters — all, needs review (pairings with confidence below 80), and unmatched — each showing how many entries it holds. A filter SHALL only change which ledger rows are displayed. It SHALL NOT change any operation's selection, and the selected count and the execute action SHALL always reflect the whole plan.

#### Scenario: Filter counts describe the whole plan

- **WHEN** the review step renders a plan
- **THEN** the all filter shows the number of pairings, the needs-review filter the number of pairings below the threshold, and the unmatched filter the number of unmatched videos plus unmatched subtitles

#### Scenario: Needs-review filter shows only low-confidence pairings

- **WHEN** the user activates the needs-review filter
- **THEN** only pairings below the threshold are displayed, each with its video name

#### Scenario: Unmatched filter shows only unmatched entries

- **WHEN** the user activates the unmatched filter
- **THEN** only the unmatched videos and unmatched subtitles are displayed

#### Scenario: Filtering does not change selection

- **WHEN** every operation is selected and the user activates the needs-review filter and then continues to execute
- **THEN** the selected count is unchanged while the filter is active and every selected operation, including those not displayed, is still selected for execution

### Requirement: Selected count is shown beside the primary action

The review step SHALL show the number of selected operations and the total number of operations beside the primary action, updating as the selection changes, with an accessible text that states both numbers in words.

#### Scenario: Count follows the selection

- **WHEN** the user deselects one of three operations
- **THEN** the figure beside the primary action changes from three of three to two of three, in both its visible and its accessible form
