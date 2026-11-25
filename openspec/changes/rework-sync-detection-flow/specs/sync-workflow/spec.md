# Spec Delta

## MODIFIED Requirements

### Requirement: Input selection for a single video–subtitle pair

The Sync wizard SHALL accept exactly one media file (video or audio) and one subtitle file, via drag-and-drop or a browse dialog, on its files step only. A subtitle without a media file SHALL be accepted and restricts the flow to skipping detection; automatic detection SHALL require the media file.

#### Scenario: Pair selection enables automatic detection

- **WHEN** the user has selected both a video file and a subtitle file
- **THEN** the detect step offers both starting the detection and skipping it

#### Scenario: Subtitle-only restricts to manual offset

- **WHEN** the user has selected only a subtitle file
- **THEN** the detect step offers skipping as its only forward action, shows no sensitivity control, and explains why detection is unavailable

#### Scenario: Drops outside the files step are ignored

- **WHEN** files are dropped on the window while any step other than the files step is shown
- **THEN** the selected files, the offset and the detection are unchanged

### Requirement: Method selection seeded from shared configuration

The detect step SHALL offer local offline detection and skipping it; the shared `sync.default_method` SHALL decide which is primary. The VAD sensitivity control SHALL be preselected from `sync.vad.sensitivity` and overridable per run without writing the configuration. Offsets SHALL be validated against `sync.max_offset_seconds` on the offset step before anything is saved.

#### Scenario: Defaults come from the shared configuration

- **WHEN** the detect step renders with `sync.vad.sensitivity = 0.4` in the shared config
- **THEN** the sensitivity control shows 0.4, and changing it for this run does not modify the configuration file

#### Scenario: Manual offset beyond the configured maximum is rejected

- **WHEN** the offset on the offset step exceeds `sync.max_offset_seconds` in magnitude
- **THEN** the wizard surfaces the configured limit and blocks proceeding until the value is reduced, and an apply with such an offset fails with `sync.offset_exceeds_max` naming the limit

#### Scenario: Configured manual method makes skipping primary

- **WHEN** the detect step renders with media and `sync.default_method = manual`
- **THEN** skip is the `next` action and start detection is the `secondary` action, and with any other method they are the other way round, unless a kept offset is offered

#### Scenario: Detected offset beyond the maximum can be reduced

- **WHEN** detection reports an offset beyond `sync.max_offset_seconds`
- **THEN** the offset step is shown with that offset, Continue disabled and the limit named, and reducing the offset enables Continue

### Requirement: Cancellable local offset detection with review and fine-tuning

Automatic detection SHALL run as a cancellable backend task, with its waiting state on the detect step, and produce the detected offset, a confidence value, and any analysis warnings. Success SHALL advance to the offset step, which SHALL present the offset in an editable field — the value applied is the reviewed value, not necessarily the detected one.

#### Scenario: Detection reports offset and confidence

- **WHEN** automatic detection completes against the selected pair
- **THEN** the offset step shows the detected offset in the editable field, its confidence, and any warnings from the analysis

#### Scenario: The reviewed value is what gets applied

- **WHEN** detection reports 1.500 s and the user edits the field to 1.250 s before applying
- **THEN** the saved output is shifted by exactly 1.250 s

#### Scenario: User cancels detection

- **WHEN** the user cancels while detection is running
- **THEN** the task is abandoned, no result is shown (including a late-arriving one), and the detect step returns to its ask state

#### Scenario: Concurrent detection is rejected

- **WHEN** a detection is already running and another is requested
- **THEN** the second request fails with `sync.detection_in_progress` and the running detection is unaffected

#### Scenario: VAD is unavailable

- **WHEN** the sync engine cannot be constructed because VAD is disabled or fails to initialize
- **THEN** the detect step surfaces `sync.vad_unavailable` and skipping to the offset step remains available

### Requirement: Sensitivity slider labels both ends

The VAD sensitivity slider SHALL show a label at each end naming what that end means, instead of a sentence beneath it. The explanatory sentence SHALL remain as the slider's accessible description.

#### Scenario: Both ends are labelled

- **WHEN** the detect step renders its ask state with a media file selected
- **THEN** a localized label is displayed at the low end and another at the high end of the slider, and the slider's accessible description is the explanatory sentence, which is not displayed

## ADDED Requirements

### Requirement: Detect step states

The detect step SHALL be in exactly one of three states: ask, detecting, or failed. Detecting SHALL show elapsed seconds as its only progress, with a decorative illustration hidden from assistive technology that is still under reduced motion. Failed SHALL show the error with retry and skip available.

#### Scenario: Detecting shows elapsed time and cancel

- **WHEN** detection is running
- **THEN** a status reports the elapsed seconds, no progress bar is present, the illustration is hidden from assistive technology, `next` is disabled and cancel is the `secondary` action

#### Scenario: Failure offers retry and skip

- **WHEN** detection fails
- **THEN** the step shows the error, retry is the `next` action and starts a new detection with the current sensitivity, and skip is the `secondary` action and enters the offset step

#### Scenario: Waiting illustration honours reduced motion

- **WHEN** the detect step's stylesheet is read under reduced motion
- **THEN** the illustration's animation is none

### Requirement: Keep the current offset

When the offset step has been visited for the current files, the detect step SHALL offer a forward action naming the current offset that returns to the offset step with the offset and detection facts intact. It SHALL be absent on the first visit and after either file changes.

#### Scenario: Keeping returns with the review intact

- **WHEN** the user goes back from the offset step with an edited offset after a detection and chooses to keep it
- **THEN** the offset step shows that offset and the same detected offset, confidence and warnings

#### Scenario: Keep is primary when asked again

- **WHEN** the ask state is shown after a visit to the offset step
- **THEN** keep is the `next` action and skip, followed by start detection when there is media, are the `secondary` actions

#### Scenario: Keep is offered after a failure

- **WHEN** a detection fails after a visit to the offset step
- **THEN** retry is the `next` action, skip and keep are the `secondary` actions, and keep returns with the review intact

#### Scenario: Keep is hidden without a review

- **WHEN** the detect step is shown for the first time, after a file change, or after the wizard restarts
- **THEN** no keep action is offered

### Requirement: Offset reset rules

Skipping SHALL enter the offset step with offset 0 and no detection facts, and a successful detection SHALL overwrite the offset. Going back, or a failed or cancelled detection, SHALL leave the offset as it was. Changing either selected file SHALL reset the offset and the detection.

#### Scenario: Skip resets the offset

- **WHEN** the user goes back from the offset step with a non-zero offset and skips
- **THEN** the offset step shows offset 0 and no detected offset or confidence

#### Scenario: Failed or cancelled detection keeps the offset

- **WHEN** the wizard holds an offset of 1250 ms and a detection fails or is cancelled
- **THEN** the wizard's offset is still 1250 ms

#### Scenario: Back from save keeps the review

- **WHEN** the user returns from the save step to the offset step
- **THEN** the edited offset and the detection facts are unchanged

#### Scenario: Changing a file resets the review

- **WHEN** a detection result is held and the user selects a different media file or subtitle, or removes one
- **THEN** the offset is 0 and no detection is held
