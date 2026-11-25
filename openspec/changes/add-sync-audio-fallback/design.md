# Design

## Context

Approved design: `docs/superpowers/specs/2026-11-25-sync-preview-design.md`, section "Audio fallback". Builds on `media_server.rs`, `PreviewState` and `commands/preview.rs` from `add-sync-media-server`.

Measured on 2026-11-25 with Symphonia 0.5.5 on generated files: a FLAC-in-Matroska file made with a 2 s input offset yields packets at `ts=2000, 2072, 2144` with time base 1/1000 s and `dur=0`; an AAC-in-MP4 file made with the same offset yields `ts=0, 1024, 2048`. Matroska timestamps are therefore usable, packet durations are not, and MP4 edit lists are ignored.

## Goals / Non-Goals

**Goals:** bounded memory, correct timeline from packet timestamps, prompt cancellation, no stray file after any handled outcome.

**Non-Goals:** track choice, resampling, transcoding, AC-3/DTS/Opus, MP4 edit lists, use of the engine's `DirectAudioLoader` (it concatenates samples and ignores timestamps).

## Decisions

### D1 Dependencies

`symphonia = { version = "0.5", default-features = false, features = ["isomp4","mkv","ogg","wav","aac","flac","mp3","pcm","vorbis"] }`; `tempfile = "3"` moves to `[dependencies]`. No new package in `Cargo.lock`.

### D2 `src-tauri/src/audio_fallback.rs`

```rust
pub const JITTER_TOLERANCE_MS: u64 = 20;
pub const MAX_WAV_DATA_BYTES: u64 = (u32::MAX - 36) as u64;

pub enum AudioFallbackError { Unsupported(String), Unreadable(String), Io(std::io::Error), Cancelled }

/// Blocking. The caller runs it in `spawn_blocking`.
pub fn decode_to_wav(media: &Path, cancel: &AtomicBool) -> Result<tempfile::NamedTempFile, AudioFallbackError>;

struct TimelineWriter<W: Write + Seek> { /* out, rate, tolerance_frames, written_frames, max_frames */ }
impl<W: Write + Seek> TimelineWriter<W> {
    fn new(out: W, rate: u32, max_data_bytes: u64) -> io::Result<Self>; // writes a 44-byte header
    fn push(&mut self, start_frame: u64, mono: &[i16], cancel: &AtomicBool) -> Result<(), AudioFallbackError>;
    fn finish(self) -> io::Result<W>; // patches both header sizes
}
```

- `decode_to_wav` opens the file, probes with the extension as hint, takes the first track whose `codec_params.sample_rate` is set (the rule detection uses), then makes its decoder. Open failure → `Unreadable`; probe, no track, or no decoder → `Unsupported`.
- Temp file: `tempfile::Builder::new().prefix("subx-preview-").suffix(".wav").tempfile()` behind a `BufWriter`. Dropping the `NamedTempFile` on any error path deletes it.
- Loop: check `cancel` before every packet (`Cancelled`); skip other tracks; `next_packet` `IoError` of kind `UnexpectedEof` ends the stream, any other error → `Unreadable`. `decode` `DecodeError` skips the packet (the next timestamp turns it into silence); any other decode error → `Unsupported`.
- Start frame: `time_base.calc_time(packet.ts)` × rate, computed in integers from `seconds` and `frac`; without a time base `packet.ts` is the frame number. `packet.dur` is never used: the length is the decoded frame count.
- A decoded buffer whose spec rate differs from the track rate → `Unsupported`.
- Downmix: `SampleBuffer::<f32>` interleaved, average of the channels, clamped to −1..1, scaled by 32767, rounded.
- `push` with `expected = written_frames`, `tol = rate * 20 / 1000`: `start > expected + tol` → write `start - expected` zero frames in chunks of at most 8192 frames, checking `cancel` per chunk; `start + tol < expected` → drop the first `expected - start` frames (all of them if the packet is shorter); otherwise append contiguously. Comparison is always against the absolute timestamp, so jitter cannot accumulate past the tolerance.
- Before any write: if `(written + new) * 2 > max_data_bytes` → `Unsupported("output exceeds the WAV size limit")`.
- `finish` patches the header and calls `flush()`; `decode_to_wav` then takes the `NamedTempFile` back with `BufWriter::into_inner` (an error is `Io`). No frame written at the end → `Unsupported`. `io::Error` → `Io`.

Mapping in `commands/preview.rs`: `Unsupported` → `preview.audio_unsupported`, `Unreadable` → `preview.media_unreadable`, `Cancelled` → `preview.cancelled`, `Io` → `ErrorDto::from(SubXError::from(io_error))` (`core.io`).

### D3 Session

`PreviewSession` gains `audio: AudioSlot` with `enum AudioSlot { Empty, Running(Arc<AtomicBool>), Ready { token: String, url: String, file: NamedTempFile } }`.

```rust
pub enum AudioStart { Ready(String), Start { media: PathBuf, cancel: Arc<AtomicBool> } }
impl PreviewState {
    pub fn begin_audio(&self, session_id: &str) -> Result<AudioStart, ErrorDto>;
    pub fn finish_audio(&self, session_id: &str, outcome: Result<NamedTempFile, AudioFallbackError>) -> Result<String, ErrorDto>;
}
```

- `begin_audio`: unknown session → `preview.cancelled`; `Running` → `preview.cancelled`; `Ready` → its URL; `Empty` → set `Running`.
- `finish_audio`: session gone → drop the file and return `preview.cancelled`; failure → slot back to `Empty` and the mapped error; success → `publish(file.path())` (memory only), slot `Ready`, URL returned.
- Closing, replacing or shutting down a session sets the cancel flag of a running job, revokes both tokens, and drops the slot (deleting the WAV). One private function `retire(server, session)` does this for all three and returns the `NamedTempFile`, which the caller drops after releasing the lock.
- The frontend issues at most one preparation per session at a time, from an event handler and not from an effect; refusing a second one is the backend's guard.

### D4 Command

`prepare_preview_audio(session_id: String, state) -> Result<PreviewAudioDto, ErrorDto>` with `PreviewAudioDto { url: String }`. It calls `begin_audio`, `spawn_blocking(decode_to_wav)`, `finish_audio`. A panicked task calls `finish_audio` with `Unsupported("the decoding task panicked")`.

### D5 Fixtures

Committed, generated once, commands recorded in `src-tauri/tests/fixtures/README.md`:

```bash
ffmpeg -f lavfi -i 'sine=f=440:r=8000:d=0.5' tone.wav
ffmpeg -itsoffset 2 -i tone.wav -c:a flac late.mkv      # about 2.5 KB
ffmpeg -f lavfi -i 'sine=f=440:r=48000:d=0.5' -c:a libopus opus.mkv
```

Only `late.mkv` and `opus.mkv` are committed. Tests read them through `env!("CARGO_MANIFEST_DIR")`. Other inputs (mono and stereo PCM WAV) are written by the test.

## Risks / Trade-offs

- [Decoding reads the whole container, video packets included, possibly from a slow mount] → the time is unbounded; leaving the step cancels it.
- [MP4 edit lists are ignored] → MP4 audio delayed by an empty edit is decoded at 0, and an AAC priming edit (about 23 to 48 ms) is not trimmed, so in audio mode such an MP4 is off by that amount. Detection in the engine has the same limit. Reported to the owner; not corrected here.
- [The system temporary directory may be in memory] → two hours of 48 kHz mono is about 690 MB there. Writing stops with `core.io` when it is full.
- [A normal exit does not drop managed state] → the exit hook of `add-sync-media-server` calls `shutdown`, which retires the session. WAVs stranded by a crash are left to the OS.
- Audible output is unverified: the probe behind the design was muted.
