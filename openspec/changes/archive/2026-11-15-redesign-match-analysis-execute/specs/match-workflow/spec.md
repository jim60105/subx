# match-workflow Delta

## ADDED Requirements

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
