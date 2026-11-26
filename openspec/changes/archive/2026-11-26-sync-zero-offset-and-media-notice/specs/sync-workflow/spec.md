## ADDED Requirements

### Requirement: A zero offset blocks continuing

The offset step SHALL disable Continue while the offset under review is exactly 0 ms, however that value was reached, and SHALL then show a visible polite status giving the reason, included in the offset field's accessible description. When the held detection reported 0 ms the reason SHALL say that detection found no offset; otherwise a generic reason SHALL be shown.

#### Scenario: Skipping enters with Continue disabled

- **WHEN** the user skips detection
- **THEN** the offset step shows offset 0, Continue is disabled, a status with the generic reason is shown, and the offset field's accessible description includes that reason

#### Scenario: Changing the offset re-enables Continue

- **WHEN** the offset is 0 and the user activates the increase control, and then clears the millisecond field
- **THEN** after the increase Continue is enabled and no reason status is present, and after clearing Continue is disabled and the generic reason is shown again

#### Scenario: Detected zero is held and blocks Continue

- **WHEN** detection reports an offset of 0 ms with a confidence and a warning
- **THEN** the offset step shows 0 in the field, the detected offset as 0.000 seconds, the confidence and the warning, Continue is disabled, and the reason shown is the detected-zero reason rather than the generic one

#### Scenario: Editing to zero after a non-zero detection

- **WHEN** detection reports 1.500 s and the user edits the field to 0
- **THEN** Continue is disabled, the generic reason is shown, and the detected offset still reads 1.500 seconds

#### Scenario: Keeping a detected zero keeps Continue disabled

- **WHEN** detection reports 0 ms, the user goes back to the detect step and chooses to keep the offset
- **THEN** the offset step shows 0 with the same detected offset and confidence, Continue is disabled, and the detected-zero reason is shown

### Requirement: Sync caution notices use the accent tokens

The detect step's notice that detection needs a media file and the offset step's zero-offset reason SHALL take their text colour from the `--accent-ink` token and a 2 px inline-start rule from the `--accent` token, and SHALL NOT reference the failure token `--del`.

#### Scenario: Missing-media notice uses the accent tokens

- **WHEN** the detect step's stylesheet rule for the missing-media notice is read
- **THEN** it declares its colour as `var(--accent-ink)` and its inline-start border as `2px solid var(--accent)`, and none of its declarations reference `--del`

#### Scenario: Zero-offset reason uses the accent tokens

- **WHEN** the offset field's stylesheet rule for the zero-offset reason is read
- **THEN** it declares its colour as `var(--accent-ink)` and its inline-start border as `2px solid var(--accent)`, and none of its declarations reference `--del`

## MODIFIED Requirements

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
- **THEN** the offset step is shown with that offset, Continue disabled and the limit named, and reducing the offset to a non-zero value within the limit enables Continue

### Requirement: Preview session follows the offset step

A preview session SHALL be opened when the offset step is shown with media and closed when it is left for any reason. Session calls SHALL be serialized, and results that arrive after leaving SHALL be closed, not shown. A subtitle that cannot be read SHALL show its error in place of the subtitle while playback stays available and Continue is not disabled by the failure.

#### Scenario: Leaving closes the session

- **WHEN** the user goes back, continues, or the wizard is unmounted
- **THEN** the open session is closed

#### Scenario: Late open is closed

- **WHEN** opening resolves after the step was left
- **THEN** that session is closed before any newer one is opened

#### Scenario: Subtitle failure keeps playback

- **WHEN** the cues cannot be loaded while the offset is non-zero and within the limit
- **THEN** their error is shown, playback works, and Continue is available
