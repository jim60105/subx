# sync-workflow Delta

## ADDED Requirements

### Requirement: Input selection for a single video–subtitle pair

The Sync wizard SHALL accept exactly one media file (video or audio) and one subtitle file, via drag-and-drop or a browse dialog. A subtitle without a media file SHALL be accepted and restricts the flow to manual offset entry; automatic detection SHALL require the media file.

#### Scenario: Pair selection enables automatic detection

- **WHEN** the user has selected both a video file and a subtitle file
- **THEN** the wizard allows proceeding with either automatic detection or manual offset

#### Scenario: Subtitle-only restricts to manual offset

- **WHEN** the user has selected only a subtitle file
- **THEN** the automatic-detection method is unavailable with an explanatory state and manual offset remains selectable

### Requirement: Method selection seeded from shared configuration

The wizard SHALL offer automatic detection (local voice-activity detection, fully offline) and manual offset entry. The VAD sensitivity control SHALL be preselected from the shared configuration's `sync.vad.sensitivity` and overridable per run without writing back to the configuration. Manual offsets SHALL be validated against `sync.max_offset_seconds` before anything runs.

#### Scenario: Defaults come from the shared configuration

- **WHEN** the method step renders with `sync.vad.sensitivity = 0.4` in the shared config
- **THEN** the sensitivity control shows 0.4, and changing it for this run does not modify the configuration file

#### Scenario: Manual offset beyond the configured maximum is rejected

- **WHEN** the user enters a manual offset whose magnitude exceeds `sync.max_offset_seconds`
- **THEN** the wizard surfaces `sync.offset_exceeds_max` naming the configured limit and blocks proceeding until the value is reduced

### Requirement: Cancellable local offset detection with review and fine-tuning

Automatic detection SHALL run as a cancellable backend task and produce the detected offset, a confidence value, and any analysis warnings. The review step SHALL present the offset in an editable field — the value ultimately applied is the reviewed value, not necessarily the detected one. In manual mode the review step SHALL show the entered offset without running detection.

#### Scenario: Detection reports offset and confidence

- **WHEN** automatic detection completes against the selected pair
- **THEN** the review step shows the detected offset, its confidence, and any warnings from the analysis

#### Scenario: The reviewed value is what gets applied

- **WHEN** detection reports 1.500 s and the user edits the field to 1.250 s before applying
- **THEN** the saved output is shifted by exactly 1.250 s

#### Scenario: User cancels detection

- **WHEN** the user cancels while detection is running
- **THEN** the task is abandoned, no result is shown (including a late-arriving one), and the wizard returns to the method step

#### Scenario: Concurrent detection is rejected

- **WHEN** a detection is already running and another is requested
- **THEN** the second request fails with `sync.detection_in_progress` and the running detection is unaffected

#### Scenario: VAD is unavailable

- **WHEN** the sync engine cannot be constructed because VAD is disabled or fails to initialize
- **THEN** the wizard surfaces `sync.vad_unavailable` and manual offset remains usable

### Requirement: Applying the offset writes a new output with overwrite protection

Applying SHALL load the subtitle, shift its timing by the reviewed offset, and save to an output path defaulting to `<stem>_synced.<ext>` beside the subtitle. The original subtitle SHALL never be modified in place. If the output path already exists, the apply SHALL fail with `sync.output_exists` unless the user explicitly confirms overwriting. The applied offset SHALL be re-validated against `sync.max_offset_seconds` at apply time.

#### Scenario: Default output path is proposed

- **WHEN** the apply step renders for subtitle `movie.srt`
- **THEN** the proposed output path is `movie_synced.srt` in the same directory, editable by the user

#### Scenario: Existing output requires confirmation

- **WHEN** the chosen output path already exists and the user has not confirmed overwriting
- **THEN** the apply fails with `sync.output_exists`, the UI asks for confirmation, and confirming retries with overwrite allowed

#### Scenario: Applied offset shifts the subtitle timing

- **WHEN** an offset of +1.000 s is applied to a subtitle whose first cue starts at 00:00:05,000
- **THEN** the saved output's first cue starts at 00:00:06,000 and the original file's timing is unchanged
