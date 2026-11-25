# Spec Delta

## ADDED Requirements

### Requirement: Preview audio is decoded onto the media timeline

The audio fallback SHALL decode the first track with a sample rate into a mono 16-bit WAV at the source rate, placing samples by packet timestamp: silence fills a late start and gaps, timestamp jitter within tolerance neither inserts nor drops samples, and overlapping samples are trimmed.

#### Scenario: Late start becomes silence

- **WHEN** a Matroska file whose audio packets start at 2 s is decoded
- **THEN** the first 2 s of the WAV are silence and the sound follows

#### Scenario: Gap becomes silence

- **WHEN** a packet starts later than the previous one ended by more than the tolerance
- **THEN** the missing time is silence and the packet is at its own timestamp

#### Scenario: Jitter is absorbed

- **WHEN** consecutive packets start within the tolerance of where the previous one ended
- **THEN** their samples are contiguous and none is dropped

#### Scenario: Overlap is trimmed

- **WHEN** a packet starts earlier than the previous one ended by more than the tolerance
- **THEN** its samples that fall before that end are dropped

#### Scenario: Channels are mixed to mono

- **WHEN** a stereo track is decoded
- **THEN** the WAV has one 16-bit channel at the source sample rate whose samples are the channel averages

### Requirement: Preview audio failures are reported and leave no file

Audio that has no decodable track, or whose WAV would exceed the format's size limit, SHALL fail with `preview.audio_unsupported`; a write failure SHALL be reported rather than truncated. Cancelling SHALL stop the job at the next packet. A failed or cancelled job SHALL delete its file.

#### Scenario: Undecodable audio is reported

- **WHEN** audio is prepared for media with no track the decoder supports
- **THEN** it fails with `preview.audio_unsupported` and no temporary file remains

#### Scenario: Oversized output is refused

- **WHEN** the WAV would exceed its size limit
- **THEN** the job fails with `preview.audio_unsupported` before writing past the limit and no temporary file remains

#### Scenario: Write failure is reported

- **WHEN** writing the WAV fails
- **THEN** the job fails with `core.io` and no audio URL is returned

#### Scenario: Cancellation deletes the partial file

- **WHEN** a running job is cancelled
- **THEN** it fails with `preview.cancelled` and its partial file is deleted

### Requirement: Preview audio belongs to its session

Preparing audio SHALL act on the open session named by its id, run at most one decoding job per session, and return a URL that serves the WAV. Closing or replacing the session SHALL cancel its job, revoke its URLs and delete its WAV.

#### Scenario: Prepared audio is served

- **WHEN** audio is prepared for an open session
- **THEN** the returned URL serves a WAV and the session's media URL still works

#### Scenario: Repeated preparation reuses the file

- **WHEN** audio is prepared again for a session that already has it
- **THEN** the same URL is returned without decoding again

#### Scenario: Concurrent preparation is refused

- **WHEN** audio is prepared while that session's job is running
- **THEN** the second request fails with `preview.cancelled` and the running job is unaffected

#### Scenario: Closing removes the audio

- **WHEN** a session with prepared audio is closed or replaced
- **THEN** the audio URL answers 404 and the WAV no longer exists

#### Scenario: Stale session is refused

- **WHEN** audio is prepared for a session that is not open
- **THEN** it fails with `preview.cancelled`
