# match-workflow Delta

## MODIFIED Requirements

### Requirement: Review of the match plan grouped by video

Step 3 SHALL present the analysis result as a ledger with one row per pairing, in plan (video) order and never re-sorted: the first pairing of a video shows the video name, and later pairings of the same video omit the repeated name. Each row shows the subtitle name, its language tag when one was detected, and the resulting file name. Confidence SHALL be shown only when it is below 80; such a row SHALL be marked and SHALL show the AI's reasoning (displayed verbatim) expanded in place, while every other row exposes its reasoning on demand. Videos with no matched subtitle and subtitles matched to no video SHALL appear in the same ledger after the pairings, each with an empty slot on the missing side. Unmatched sets SHALL be computed against the full step-1 scan result (not only from AI-rejected candidates). The canonical plan SHALL remain in backend state; the frontend SHALL reference operations only by identifier.

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

## ADDED Requirements

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
