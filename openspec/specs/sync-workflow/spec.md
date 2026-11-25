# sync-workflow Specification

## Purpose

The end-to-end GUI sync flow: selecting one video–subtitle pair, choosing between local voice-activity detection and a manual offset, running a cancellable detection whose result the user reviews and may fine-tune, and applying the reviewed offset to a newly written output with overwrite protection. The wizard wraps the `subx-core` crate's `SyncEngine` and `FormatManager`; detection is fully local and offline, and the original subtitle is never modified in place.

## Requirements

### Requirement: Input selection for a single video–subtitle pair

The Sync wizard SHALL accept exactly one media file (video or audio) and one subtitle file, via drag-and-drop or a browse dialog, on its files step only. A subtitle without a media file SHALL be accepted and restricts the flow to skipping detection; automatic detection SHALL require the media file.

#### Scenario: Pair selection enables automatic detection

- **WHEN** the user has selected both a video file and a subtitle file
- **THEN** the detect step offers both starting the detection and skipping it

#### Scenario: Subtitle-only restricts to manual offset

- **WHEN** the user has selected only a subtitle file and has not visited the offset step for it
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

- **WHEN** the detect step renders its ask state with a media file selected
- **THEN** a localized label is displayed at the low end and another at the high end of the slider, and the slider's accessible description is the explanatory sentence, which is not displayed

### Requirement: Preview cues come from the apply loader

The backend SHALL return the cues of a subtitle file in file order, as whole-millisecond start and end times with their text, read through the same loader that applying an offset uses. A subtitle that loader refuses SHALL yield that loader's error.

#### Scenario: Cues are returned in file order

- **WHEN** preview cues are requested for a subtitle whose second cue starts earlier than its first
- **THEN** the cues are returned in file order with the start, end and text the apply loader reads

#### Scenario: Unparsable subtitle reports the loader error

- **WHEN** preview cues are requested for a file that is not a subtitle
- **THEN** the request fails with the same code applying an offset to that file would report

### Requirement: Preview media is served over token-authorized loopback HTTP

Preview media SHALL be served over HTTP on `127.0.0.1` at an OS-chosen port, one regular file per random 128-bit token, with `GET` and `HEAD`, single byte ranges, streamed bodies, `Cache-Control: no-store` and no CORS headers. A request SHALL never select a file by path.

#### Scenario: Single byte range is served

- **WHEN** a published file of 100 bytes is requested with `Range: bytes=10-19`, `bytes=90-` or `bytes=-10`
- **THEN** the response is 206 with the matching bytes, `Content-Length` and `Content-Range`

#### Scenario: Unsatisfiable range is refused

- **WHEN** a published file of 100 bytes is requested with `Range: bytes=100-`
- **THEN** the response is 416 with `Content-Range: bytes */100`

#### Scenario: Unusable range header returns the whole file

- **WHEN** the `Range` header is missing, malformed or names several ranges
- **THEN** the response is 200 with the whole file and `Accept-Ranges: bytes`

#### Scenario: HEAD carries no body

- **WHEN** a published file is requested with `HEAD`
- **THEN** the response has the file's `Content-Length` and no body

#### Scenario: Other methods are refused

- **WHEN** a published resource is requested with `POST`
- **THEN** the response is 405

#### Scenario: Unknown token is refused

- **WHEN** a request names a token that was never published or was revoked
- **THEN** the response is 404

#### Scenario: Foreign host is refused

- **WHEN** a request for a published resource carries a `Host` other than the server's own `127.0.0.1` address and port
- **THEN** the response is 403

#### Scenario: Revocation stops a running stream

- **WHEN** a token is revoked while its file is being streamed
- **THEN** the stream ends before the announced length is delivered

#### Scenario: Server listens on loopback only

- **WHEN** the server starts
- **THEN** its listening address is `127.0.0.1`

### Requirement: At most one preview session is open

Opening a preview SHALL publish the selected media file and return a session id and its URL, replacing any open session. Closing SHALL revoke the session's URL, be idempotent, and have no effect on any other session. Media that is not a readable regular file SHALL fail with `preview.media_unreadable`; a server that cannot start SHALL fail with `preview.server_unavailable`.

#### Scenario: Opening replaces the previous session

- **WHEN** a preview is opened while another is open
- **THEN** the first session's URL answers 404 and the second session's URL serves its file

#### Scenario: Stale close is ignored

- **WHEN** a replaced session's id is closed
- **THEN** the close succeeds and the newer session's URL still serves its file

#### Scenario: Closing is idempotent

- **WHEN** a session is closed twice
- **THEN** both closes succeed and its URL answers 404

#### Scenario: Unreadable media is reported

- **WHEN** a preview is opened for a directory or a missing file
- **THEN** it fails with `preview.media_unreadable` and an already open session stays open

### Requirement: The content policy admits loopback media only

The application's content security policy SHALL declare `media-src` with exactly `'self'` and `http://127.0.0.1:*`, and the asset protocol SHALL stay disabled.

#### Scenario: Policy lists loopback media

- **WHEN** the application's content security policy is parsed
- **THEN** `media-src` contains exactly `'self'` and `http://127.0.0.1:*`, no other directive names `127.0.0.1`, and no asset protocol is enabled

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

Audio that has no decodable track, or whose WAV would exceed the format's size limit, SHALL fail with `preview.audio_unsupported`; a write failure SHALL be reported rather than truncated. Cancelling SHALL stop the job at the next packet. A failed or cancelled job SHALL release its file.

#### Scenario: Undecodable audio is reported

- **WHEN** audio is prepared for media with no track the decoder supports
- **THEN** it fails with `preview.audio_unsupported` and no file handle remains

#### Scenario: Oversized output is refused

- **WHEN** the WAV would exceed its size limit
- **THEN** the job fails with `preview.audio_unsupported` before writing past the limit and no file handle remains

#### Scenario: Write failure is reported

- **WHEN** writing the WAV fails
- **THEN** the job fails with `core.io` and no audio URL is returned

#### Scenario: Cancellation releases the partial file

- **WHEN** a running job is cancelled
- **THEN** it fails with `preview.cancelled` and its partial file is released

### Requirement: Preview audio belongs to its session

Preparing audio SHALL act on the open session named by its id, run at most one decoding job per session, and return a URL that serves the WAV. The WAV SHALL be an unnamed temporary file. Releasing it, or closing or replacing the session, or application exit SHALL cancel the job, revoke its URL and drop its file.

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
- **THEN** the audio URL answers 404 and no handle to the WAV remains once its streams have ended

#### Scenario: Releasing keeps the session

- **WHEN** audio is released for an open session, whether ready, running or absent
- **THEN** the release succeeds, any job is cancelled, the audio URL answers 404, no handle to the WAV remains, the media URL still works, and audio can be prepared again

#### Scenario: Superseded job cannot publish

- **WHEN** a released job finishes after a new preparation started for the same session
- **THEN** its result is dropped with `preview.cancelled` and the new job is unaffected

#### Scenario: Prepared audio has no name

- **WHEN** audio has been decoded on Unix
- **THEN** the temporary directory lists no entry for it

#### Scenario: Ranges are served from the open file

- **WHEN** two overlapping ranges of the prepared audio are requested at the same time
- **THEN** each response has exactly its own bytes

#### Scenario: Stale session is refused

- **WHEN** audio is prepared for a session that is not open
- **THEN** it fails with `preview.cancelled`

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

- **WHEN** only a second audio track has a delay, and then when the decoded audio track follows an undelayed video track and has a delay itself
- **THEN** the first WAV has no leading silence and the second starts with the audio track's delay

#### Scenario: Complex edit lists are refused

- **WHEN** the edit list has two non-empty edits, an empty edit between two others, or a non-empty edit with a rate other than 1
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

### Requirement: Detect step states

The detect step SHALL be in exactly one of three states: ask, detecting, or failed. Detecting SHALL show elapsed seconds as its only progress, with a decorative illustration hidden from assistive technology that is still under reduced motion. Failed SHALL show the error with retry and skip available.

#### Scenario: Detecting shows elapsed time and cancel

- **WHEN** detection is running
- **THEN** a status reports the elapsed seconds, no progress bar is present, the illustration is hidden from assistive technology, `next` is disabled and cancel is the `secondary` action

#### Scenario: Failure offers retry and skip

- **WHEN** detection fails before any visit to the offset step
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
