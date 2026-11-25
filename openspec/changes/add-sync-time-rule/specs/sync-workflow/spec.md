# Spec Delta

## RENAMED Requirements

- FROM: `### Requirement: Offset is shown as a nudgeable figure with a schematic preview`
- TO: `### Requirement: Offset is shown as a nudgeable figure with a time rule`

## MODIFIED Requirements

### Requirement: Offset is shown as a nudgeable figure with a time rule

The offset SHALL be shown in seconds as a prominent figure with a decrease and an increase control that each change it by one nudge step, alongside the editable millisecond field. A time rule, where shown, SHALL draw the original and shifted cue times; it SHALL be hidden from assistive technology, not respond to dragging, and SHALL NOT draw audio data. The sentence explaining the sign SHALL remain available to assistive technology.

#### Scenario: Nudge controls step the offset

- **WHEN** the user activates the increase control and then the decrease control twice
- **THEN** the offset rises by one nudge step and then falls by two, and the millisecond field and the seconds figure show the same value after each activation

#### Scenario: Preview follows the sign of the offset

- **WHEN** the offset is positive, then zero, then negative
- **THEN** a cue's shifted bar is drawn later than, at, and earlier than its original bar, and the original bar is the same in all three

#### Scenario: Preview is schematic and hidden from assistive technology

- **WHEN** the offset step renders for any offset value with playable media
- **THEN** the time rule is excluded from the accessibility tree, contains no focusable element and is drawn from cue times only, and the sentence explaining the sign is present as visually hidden text

## ADDED Requirements

### Requirement: Time rule scrolls real cues

The time rule SHALL draw, around the playback position at a fixed centre needle, a tick per second and the cues whose original or shifted time falls in the visible window, and only those. The cues active at the position SHALL be marked. It SHALL be shown only while playable media and cues are available.

#### Scenario: Only cues in the window are drawn

- **WHEN** a subtitle has 2000 cues and the position is in its middle
- **THEN** only cues whose original or shifted interval intersects the visible window have bars

#### Scenario: Cue under the needle is marked

- **WHEN** the position is inside a cue's shifted interval
- **THEN** that cue's shifted bar is marked active and no other is

#### Scenario: Clamped cue has no shifted bar

- **WHEN** the offset clamps a visible cue to zero length
- **THEN** its original bar is drawn and it has no shifted bar

#### Scenario: Rule is absent without playable media or cues

- **WHEN** the preview is unavailable, preparing or without media, or the cues failed to load
- **THEN** no time rule is rendered and the offset controls are unchanged
