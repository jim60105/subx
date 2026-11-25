# Spec Delta

## ADDED Requirements

### Requirement: MP4 preview audio keeps presentation time

For MP4 media the audio fallback SHALL place samples at the presentation time given by the selected track's own edit list. Media before the edit's media time SHALL be trimmed. A leading empty edit longer than 40 ms, an edit list that is not one normal-rate edit after leading empty edits, or a first fragment not starting at 0 SHALL fail with `preview.audio_timing_unsupported`. Malformed structure SHALL fail with `preview.audio_unsupported`.

#### Scenario: Encoder priming is trimmed

- **WHEN** an MP4 whose AAC track has one edit with media time 1024 at 44100 Hz is decoded
- **THEN** decoding succeeds and the WAV starts with the sample at media time 1024

#### Scenario: Delayed audio is refused

- **WHEN** the selected track's edit list starts with a 1976 ms empty edit
- **THEN** preparation fails with `preview.audio_timing_unsupported` before any temporary file is created

#### Scenario: Negligible delay is accepted

- **WHEN** the leading empty edits total 40 ms, and then 41 ms
- **THEN** the first is accepted and the second is refused

#### Scenario: Timescales are kept apart

- **WHEN** the movie timescale is 1000, the media timescale is 48000, and the edits are a 30-tick empty edit and media time 2400
- **THEN** the delay is 30 ms and 2400 media ticks are trimmed

#### Scenario: Video edits do not excuse audio

- **WHEN** the video track and the audio track both start with the same 500 ms empty edit
- **THEN** preparation is refused, and it is accepted when only the video track has that edit

#### Scenario: Selected track decides

- **WHEN** a second audio track has a delay and the track that is decoded has none
- **THEN** decoding is accepted

#### Scenario: Complex edit lists are refused

- **WHEN** the edit list has two non-empty edits, an empty edit between or a rate other than 1
- **THEN** preparation fails with `preview.audio_timing_unsupported`

#### Scenario: Both edit list versions and box orders are read

- **WHEN** the edit list is version 0 or 1 and the movie box precedes or follows the media data
- **THEN** the same delay and trim are found

#### Scenario: Late first fragment is refused

- **WHEN** a fragmented MP4's first fragment of the selected track has a decode time that is not 0
- **THEN** preparation fails with `preview.audio_timing_unsupported`

#### Scenario: Malformed boxes end safely

- **WHEN** a box is truncated, overruns its parent, has a size below its header, or an edit list claims more entries than it holds
- **THEN** preparation fails with `preview.audio_unsupported` without reading past the box
