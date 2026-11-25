# Spec Delta

## ADDED Requirements

### Requirement: MP4 preview audio keeps presentation time

For MP4 media the audio fallback SHALL place samples by the selected track's own edit list: silence for leading empty edits, media before the edit's media time trimmed, media after its duration dropped, each bound rounded to whole samples. An edit list that is not one normal-rate edit after leading empty edits, or a first fragment not starting at 0, SHALL fail with `preview.audio_timing_unsupported`; malformed structure with `preview.audio_unsupported`.

#### Scenario: Encoder priming is trimmed

- **WHEN** an MP4 whose AAC track has one edit with media time 1024 at 44100 Hz is decoded
- **THEN** decoding succeeds and the WAV starts with the sample at media time 1024

#### Scenario: Delay becomes silence

- **WHEN** the selected track's edits are a 1976-tick empty edit at movie timescale 1000 and then media time 0, at 44100 Hz
- **THEN** the WAV starts with exactly 87142 zero samples and the first media sample follows

#### Scenario: Short delay is not absorbed as jitter

- **WHEN** the leading empty edit is 10 ms
- **THEN** the WAV starts with 10 ms of silence

#### Scenario: Trim and delay compose

- **WHEN** the edits are a 500 ms empty edit and then media time 1024 at 48000 Hz
- **THEN** the WAV is 24000 zero samples followed by the sample at media time 1024, and no sample before media time 1024 is present

#### Scenario: Timescales are kept apart

- **WHEN** the movie timescale is 1000, the media timescale is 48000, and the edits are a 30-tick empty edit and media time 2400
- **THEN** 30 ms of silence are written and 2400 media ticks are trimmed

#### Scenario: Equal audio and video edits keep the delay

- **WHEN** the video track and the audio track both start with the same 500 ms empty edit
- **THEN** the WAV starts with 500 ms of silence, and with none when only the video track has that edit

#### Scenario: Media past the edit is dropped

- **WHEN** the edit's duration is 500 ms and its media continues for longer
- **THEN** the WAV holds the leading silence plus 500 ms, and a duration of 0 or a fragmented file drops nothing

#### Scenario: Hostile delay is bounded

- **WHEN** the empty edits would exceed the WAV size limit, or the job is cancelled while their silence is written
- **THEN** the first fails with `preview.audio_unsupported` before writing it and the second with `preview.cancelled`

#### Scenario: Selected track decides

- **WHEN** a second audio track has a delay and the track that is decoded has none
- **THEN** the WAV has no leading silence

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
