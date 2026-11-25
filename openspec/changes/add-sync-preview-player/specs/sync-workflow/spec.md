# Spec Delta

## ADDED Requirements

### Requirement: Preview timing matches the applied shift

The preview SHALL shift each cue's start and end by the offset, clamped at zero, and show a cue while its shifted start is at or before the position and its shifted end is after it. Overlapping cues SHALL be shown together in file order on separate lines. Before the file format's own rounding, previewed and applied times SHALL agree within 1 ms.

#### Scenario: Cue is active from start to before end

- **WHEN** a cue runs from 5000 to 7000 ms with an offset of 1000 ms
- **THEN** it is shown at 6000 ms and 7999 ms and not at 5999 ms or 8000 ms

#### Scenario: Negative shift clamps at zero

- **WHEN** a cue runs from 500 to 1500 ms with an offset of -1000 ms
- **THEN** it is shown from 0 to before 500 ms

#### Scenario: Cue clamped to zero length is not shown

- **WHEN** a cue runs from 200 to 800 ms with an offset of -1000 ms
- **THEN** it is never shown

#### Scenario: Overlapping cues keep file order

- **WHEN** two cues are active and the later one in the file starts first
- **THEN** both are shown on separate lines in file order

#### Scenario: Applied times agree with the preview

- **WHEN** offsets of 1, -1, 50, 1234 and 59999 ms are applied to cue times and compared with the preview rule
- **THEN** every applied time before saving is within 1 ms of the previewed time

### Requirement: Cue text is inert

Cue text SHALL be rendered as text only. ASS override blocks and HTML-like tags SHALL be removed, ASS line breaks SHALL become newlines, and markup SHALL never be interpreted.

#### Scenario: Markup is removed

- **WHEN** a cue's text is `{\an8}<i>a</i>\Nb < c`
- **THEN** the shown text is `a`, a line break, and `b < c`

#### Scenario: Markup is never interpreted

- **WHEN** a cue's text contains an image tag with an event handler
- **THEN** the subtitle slip contains no element created from the cue text

### Requirement: Preview media states

The offset step SHALL prefer the picture, fall back to decoded audio when the media element fails or the user asks for it, and otherwise report the preview as unavailable, showing the reason. No preview state SHALL block editing the offset or continuing.

#### Scenario: No media shows no player

- **WHEN** the offset step opens without a media file
- **THEN** no preview session is opened, the stage says that there is no media, and the offset can be edited and continued with

#### Scenario: Media failure falls back to audio

- **WHEN** the media element reports an error
- **THEN** audio is prepared, the stage says why, and the prepared audio then plays through the same controls

#### Scenario: User switches a silent video to audio

- **WHEN** the user activates the no-sound control while the video plays at 12 s with volume 0.5
- **THEN** the prepared audio continues from 12 s, playing, with volume 0.5

#### Scenario: Failed switch can return to video

- **WHEN** preparing audio fails after the user switched from a playable video
- **THEN** the error is shown with a control that returns to the video at the same position

#### Scenario: Unavailable preview does not block

- **WHEN** opening the preview fails, or audio preparation fails after a media failure
- **THEN** the error is shown and the offset can be edited and continued with

#### Scenario: Sound without a picture is not an error

- **WHEN** media loads without a decodable picture
- **THEN** playback is available and the stage shows the audio mark

#### Scenario: Failed audio playback releases the audio

- **WHEN** the prepared audio itself fails to play
- **THEN** the session's audio is released while the session stays open, and the preview is unavailable

### Requirement: Preview playback controls

The player SHALL start paused and unmuted and offer named play/pause, seek and volume controls with position and duration. It SHALL add no global keyboard shortcut. Frames SHALL be requested only while playing; a seek or offset change while paused SHALL redraw without continuous frames.

#### Scenario: Player starts paused and unmuted

- **WHEN** the media loads
- **THEN** it is paused, not muted, and the play control is named

#### Scenario: Offset change does not disturb playback

- **WHEN** the offset changes while media is playing
- **THEN** the shown cue follows the new offset and the media source, position and play state are untouched

#### Scenario: Paused redraw

- **WHEN** the user seeks or changes the offset while paused
- **THEN** the shown cue and position update and no further frame is requested

#### Scenario: Frames stop with playback

- **WHEN** playback pauses, ends, or the step is left
- **THEN** no animation frame remains requested

### Requirement: Preview session follows the offset step

A preview session SHALL be opened when the offset step is shown with media and closed when it is left for any reason. Session calls SHALL be serialized, and results that arrive after leaving SHALL be closed, not shown. A subtitle that cannot be read SHALL show its error in place of the subtitle while playback and Continue stay available.

#### Scenario: Leaving closes the session

- **WHEN** the user goes back, continues, or the wizard is unmounted
- **THEN** the open session is closed

#### Scenario: Late open is closed

- **WHEN** opening resolves after the step was left
- **THEN** that session is closed before any newer one is opened

#### Scenario: Subtitle failure keeps playback

- **WHEN** the cues cannot be loaded
- **THEN** their error is shown, playback works, and Continue is available
