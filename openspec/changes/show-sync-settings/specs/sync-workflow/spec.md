# sync-workflow Delta

## ADDED Requirements

### Requirement: Offset is shown as a nudgeable figure with a schematic preview

Wherever the offset is edited, it SHALL be shown in seconds as a prominent figure with a decrease and an increase control that each change it by one nudge step, alongside the editable millisecond field. A schematic cue-bar preview SHALL reflect the direction of the offset; it SHALL be hidden from assistive technology and SHALL NOT draw audio data. The sentence explaining the sign SHALL remain available to assistive technology.

#### Scenario: Nudge controls step the offset

- **WHEN** the user activates the increase control and then the decrease control twice
- **THEN** the offset rises by one nudge step and then falls by two, and the millisecond field and the seconds figure show the same value after each activation

#### Scenario: Preview follows the sign of the offset

- **WHEN** the offset is positive, then zero, then negative
- **THEN** the preview marks its shifted row as later, then unshifted, then earlier, and the original row is the same in all three

#### Scenario: Preview is schematic and hidden from assistive technology

- **WHEN** the offset control renders for any offset value
- **THEN** the preview is excluded from the accessibility tree and contains the same fixed number of cue bars, and the sentence explaining the sign is present as visually hidden text

### Requirement: Apply step shows source and output as a diff

Before saving, the apply step SHALL show the selected subtitle as a kept line and the output path as a created line, instead of a sentence stating that the original is untouched.

#### Scenario: Source is unmarked and output is created

- **WHEN** the apply step renders for subtitle `movie.srt` with the proposed output `movie_synced.srt`
- **THEN** it shows `movie.srt` as a kept line and `movie_synced.srt` as a created line, and editing the output path updates the created line

### Requirement: Sensitivity slider labels both ends

The VAD sensitivity slider SHALL show a label at each end naming what that end means, instead of a sentence beneath it. The explanatory sentence SHALL remain as the slider's accessible description.

#### Scenario: Both ends are labelled

- **WHEN** the method step renders with automatic detection selected
- **THEN** a localized label is displayed at the low end and another at the high end of the slider, and the slider's accessible description is the explanatory sentence, which is not displayed
