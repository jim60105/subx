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

Step 2 SHALL run the AI analysis without blocking the UI, presenting staged progress (scanning → analyzing → finalizing) driven by backend progress messages. When the crate's persistent match cache resolves the analysis without a live AI request, the staged display SHALL still describe the stages without claiming one. Cancellation SHALL discard the pending analysis and return to Step 1 without filesystem changes, and only one analysis SHALL run at a time.

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

The review step SHALL show a quick-select bar above the operation list whenever the plan is non-empty: one control per subtitle language present, plus one `Other` group for undetected languages. Each control SHALL show the localized group name and its count, checked when all its operations are selected, indeterminate when some are, and an explicit accessible name. Activating it SHALL select its operations when any is unselected, clear them otherwise, and stay in sync with the row checkboxes.

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

### Requirement: Analysis illustration never claims progress

While the analysis runs, Step 2 SHALL show an illustration beneath the staged indicator. The illustration SHALL be hidden from assistive technology and SHALL NOT present a percentage, a file name, a progress role, or any element whose quantity varies with the real data; the two scan totals are the only data shown with it. When the user prefers reduced motion the illustration SHALL be static and identical in every stage, so only the staged indicator changes.

#### Scenario: Illustration carries no progress semantics

- **WHEN** the analysis step renders in any stage
- **THEN** the illustration is excluded from the accessibility tree, and the step exposes no progress-bar role and displays no percentage

#### Scenario: Illustration size is independent of the scan

- **WHEN** the step renders once for a scan of 3 videos and 5 subtitles and once for a scan of 300 videos and 500 subtitles
- **THEN** the illustration contains the same number of video shapes and the same number of subtitle shapes in both

#### Scenario: Scan totals are the only data shown

- **WHEN** the analysis step renders after a scan that found videos and subtitles
- **THEN** the two scan totals are displayed with their nouns, and the illustration itself contains no text

#### Scenario: Reduced motion renders a static illustration

- **WHEN** the user prefers reduced motion and the stage advances from scanning through analyzing to finalizing
- **THEN** the illustration's content is identical in all three stages and no timer is scheduled for it, while the staged indicator still marks the current stage

### Requirement: Execute step lists every selected operation before running

Before execution, Step 4 SHALL list every selected operation as its current subtitle name and its resulting file name, in plan order, beneath the selected-operation count and the relocation mode chosen in Step 1. Operations that are not selected SHALL NOT be listed.

#### Scenario: Selected operations are listed before running

- **WHEN** the execute step opens with two of three operations selected
- **THEN** it shows the count two with the relocation mode and exactly two rows, in plan order, each showing the subtitle's current name and its resulting file name

#### Scenario: Deselected operations are absent

- **WHEN** the execute step opens after the user deselected one operation
- **THEN** no row shows that operation's subtitle name

### Requirement: Execute step resolves each row from the single report

While execution runs, Step 4 SHALL show an indeterminate activity indicator and SHALL NOT mark any listed row as succeeded or failed. When the report arrives every row SHALL carry its outcome: a success marks the new name created and the old name removed — or unchanged when the relocation mode is copy — and a failure shows its localized error beneath the row. The success and failure totals SHALL be shown. Under reduced motion the final state SHALL appear without any delayed reveal.

#### Scenario: Running shows no per-row outcome

- **WHEN** execution has started and no report has arrived
- **THEN** an indeterminate activity indicator is exposed, every row is still pending, and no row shows a success or failure mark

#### Scenario: A successful row resolves as removed and created

- **WHEN** the report marks an operation as applied under the rename or the move relocation mode
- **THEN** its row shows the old name as a removed line and the new name as a created line, and states success in text available to assistive technology

#### Scenario: A successful copy keeps the original

- **WHEN** the report marks an operation as applied under the copy relocation mode
- **THEN** its row shows the old name as a kept line, not a removed one, and the new name as a created line

#### Scenario: A failed row shows its error beneath it

- **WHEN** the report marks an operation as not applied with an error code
- **THEN** its row is marked failed and shows the localized error for that code inside the row, and the other rows keep their own outcomes

#### Scenario: Totals count successes and failures

- **WHEN** the report carries two successes and one failure
- **THEN** the step shows the figure two for successes and the figure one for failures in place of the pre-run count

#### Scenario: Reduced motion reveals the final state at once

- **WHEN** the report arrives while the user prefers reduced motion
- **THEN** the reduced-motion style rule removes every transition and animation delay, so no row is revealed later than another

### Requirement: Operation language follows the resulting file name

The backend SHALL report each operation's language as the normalized language tag its resulting file name carries between the video's base name and the subtitle extension. A language tag is a code of two or three letters with optional subtags, other than `und`, `cc`, and `sdh`. Only when that name carries no language tag SHALL it report the language detected from the subtitle's source path, or none when neither yields one.

#### Scenario: The tag in the resulting name decides the language

- **WHEN** a subtitle whose source path carries no language marker will become `show.sc.srt` beside `show.mkv`
- **THEN** its operation reports the language `sc`

#### Scenario: A language the path detector does not know is reported

- **WHEN** a subtitle will become `show.th.srt` beside `show.mkv`
- **THEN** its operation reports the language `th`

#### Scenario: The resulting name outranks the source path

- **WHEN** a subtitle whose source path is detected as English will become `show.sc.srt` beside `show.mkv`
- **THEN** its operation reports the language `sc`

#### Scenario: Spellings of one language share one code

- **WHEN** three subtitles will become `show.CHT.srt`, `show.zh-TW.srt`, and `show.tc.2.srt` beside `show.mkv`
- **THEN** all three operations report the language `tc`

#### Scenario: Text belonging to the video name is not a language

- **WHEN** a subtitle without any language marker in its source path will become `show.en.srt` beside `show.en.mkv`
- **THEN** its operation reports no language

#### Scenario: A suffix that is not a language falls back to the source path

- **WHEN** one subtitle whose source path is detected as English and one whose source path carries no marker will become `show.2.srt` and `show.forced.srt` beside `show.mkv`
- **THEN** the first operation reports `en` and the second reports no language

#### Scenario: Excluded tags are not languages

- **WHEN** unmarked subtitles will become `show.und.srt`, `show.cc.srt`, and `show.sdh.srt` beside `show.mkv`
- **THEN** none of their operations reports a language

### Requirement: Quick-select names languages without a hand-written label

A quick-select control for a two- or three-letter language code that has no translated label SHALL be named by the platform's language names in the current interface language. A code the platform cannot name, or any other code form, SHALL be shown verbatim.

#### Scenario: A code without a translated label is localized

- **WHEN** the review step renders an operation with language `th` in English and then in Traditional Chinese
- **THEN** its control is named with the platform's English and Traditional Chinese names for Thai, not with the bare code

#### Scenario: A code the platform cannot name is shown verbatim

- **WHEN** the review step renders operations with languages `qqq` and `x_y`
- **THEN** each control is named with its code

### Requirement: Whole-row selection toggle

Activating the pointer's primary button anywhere on a pairing row SHALL toggle that operation's selection exactly once, except on a nested interactive control, which SHALL only perform its own action, and except when the pointer gesture selects text. The row itself SHALL NOT be focusable or expose an interactive role; the checkbox SHALL remain the keyboard and assistive-technology control.

#### Scenario: Clicking row content toggles the row

- **WHEN** the user clicks a pairing's video name, subtitle name, or resulting name
- **THEN** that operation's selection toggles once per click and no other operation changes

#### Scenario: Clicking the checkbox toggles exactly once

- **WHEN** the user clicks a pairing's checkbox, or focuses it and presses Space
- **THEN** that operation's selection toggles exactly once

#### Scenario: The disclosure does not change selection

- **WHEN** the user opens or closes a pairing's reasoning disclosure by pointer or keyboard
- **THEN** the disclosure state changes and the operation's selection does not

#### Scenario: Revealed reasoning text belongs to the row

- **WHEN** the user clicks reasoning text shown in a pairing row
- **THEN** that operation's selection toggles once and an open disclosure stays open

#### Scenario: Selecting text does not toggle

- **WHEN** the user drags to select text inside a pairing row
- **THEN** no operation's selection changes

#### Scenario: An existing selection does not block a click

- **WHEN** text in a row is already selected and the user clicks that row without moving the pointer
- **THEN** that operation's selection toggles once

#### Scenario: A double click is two toggles

- **WHEN** the user double-clicks a pairing's subtitle name
- **THEN** the operation's selection toggles twice

#### Scenario: Unmatched rows do not toggle

- **WHEN** the user clicks an unmatched row
- **THEN** no operation's selection changes

#### Scenario: The row adds no keyboard stop

- **WHEN** a pairing row is rendered
- **THEN** it carries no tab index and no role attribute, and its checkbox keeps its accessible name
