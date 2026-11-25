# Design

## Context

Approved design: `docs/superpowers/specs/2026-11-25-sync-preview-design.md`, section "Audio fallback". Builds on `media_server.rs`, `PreviewState` and `commands/preview.rs` from `add-sync-media-server`.

Measured on 2026-11-25 with Symphonia 0.5.5 on generated files: a FLAC-in-Matroska file made with a 2 s input offset yields packets at `ts=2000, 2072, 2144` with time base 1/1000 s and `dur=0`; an AAC-in-MP4 file made with the same offset yields `ts=0, 1024, 2048`. Matroska timestamps are therefore usable, packet durations are not, and MP4 edit lists are ignored.

## Goals / Non-Goals

**Goals:** bounded memory, correct timeline from packet timestamps, prompt cancellation, no stray file after any handled outcome.

**Non-Goals:** track choice, resampling, transcoding, AC-3/DTS/Opus, MP4 edit lists (`guard-mp4-preview-audio`), use of the engine's `DirectAudioLoader` (it concatenates samples and ignores timestamps).

## Decisions

### D1 Dependencies

`symphonia = { version = "0.5", default-features = false, features = ["isomp4","mkv","ogg","wav","aac","flac","mp3","pcm","vorbis"] }`; `tempfile = "3"` moves to `[dependencies]` (tests then need no separate entry). No new package in `Cargo.lock`.

### D2 `src-tauri/src/audio_fallback.rs`

```rust
pub const JITTER_TOLERANCE_MS: u64 = 20;
pub const MAX_WAV_DATA_BYTES: u64 = (u32::MAX - 36) as u64;

pub enum AudioFallbackError { Unsupported(String), Unreadable(String), Io(std::io::Error), Cancelled }

/// Blocking. The caller runs it in `spawn_blocking`.
pub fn decode_to_wav(media: &Path, cancel: &AtomicBool) -> Result<std::fs::File, AudioFallbackError>;

struct TimelineWriter<W: Write + Seek> { /* out, rate, tolerance_frames, written_frames, max_frames */ }
impl<W: Write + Seek> TimelineWriter<W> {
    fn new(out: W, rate: u32, max_data_bytes: u64) -> io::Result<Self>; // writes a 44-byte header
    fn push(&mut self, start_frame: u64, mono: &[i16], cancel: &AtomicBool) -> Result<(), AudioFallbackError>;
    fn finish(self) -> io::Result<W>; // patches both header sizes
}
```

- `decode_to_wav` opens the file, probes with the extension as hint, takes the first track whose `codec_params.sample_rate` is set (the rule detection uses), then makes its decoder. Open failure → `Unreadable`; probe, no track, or no decoder → `Unsupported`.
- Temp file: `tempfile::tempfile_in(dir)` behind a `BufWriter`, `dir` being `std::env::temp_dir()`. Verified in tempfile 3.27: Linux uses `O_TMPFILE`, falling back to create-then-unlink; other Unix unlinks at once; Windows opens with delete-on-close and share mode 0, so it cannot be reopened by path and must be read through this handle. Dropping the last handle frees it on every path.
- Loop: check `cancel` before every packet (`Cancelled`); skip other tracks; `next_packet` `IoError` of kind `UnexpectedEof` ends the stream, any other error → `Unreadable`. `decode` `DecodeError` skips the packet (the next timestamp turns it into silence); any other decode error → `Unsupported`.
- Start frame: `time_base.calc_time(packet.ts)` × rate, computed in integers from `seconds` and `frac`; without a time base `packet.ts` is the frame number. `packet.dur` is never used: the length is the decoded frame count.
- A decoded buffer whose spec rate differs from the track rate → `Unsupported`.
- Downmix: `SampleBuffer::<f32>` interleaved, average of the channels, clamped to −1..1, scaled by 32767, rounded.
- `push` with `expected = written_frames`, `tol = rate * 20 / 1000`: `start > expected + tol` → write `start - expected` zero frames in chunks of at most 8192 frames, checking `cancel` per chunk; `start + tol < expected` → drop the first `expected - start` frames (all of them if the packet is shorter); otherwise append contiguously. Comparison is always against the absolute timestamp, so jitter cannot accumulate past the tolerance.
- Before any write: if `(written + new) * 2 > max_data_bytes` → `Unsupported("output exceeds the WAV size limit")`.
- `finish` patches the header and calls `flush()`; `decode_to_wav` then takes the `File` back with `BufWriter::into_inner` (an error is `Io`). No frame written at the end → `Unsupported`. `io::Error` → `Io`.

Mapping in `commands/preview.rs`: `Unsupported` → `preview.audio_unsupported`, `Unreadable` → `preview.media_unreadable`, `Cancelled` → `preview.cancelled`, `Io` → `ErrorDto::from(SubXError::from(io_error))` (`core.io`).

### D3 Session

`PreviewSession` gains `audio: AudioSlot` with `enum AudioSlot { Empty, Running(Arc<AtomicBool>), Ready { token: String, url: String } }`. The server's entry owns the file.

```rust
pub enum AudioStart { Ready(String), Start { media: PathBuf, cancel: Arc<AtomicBool> } }
impl PreviewState {
    pub fn begin_audio(&self, session_id: &str) -> Result<AudioStart, ErrorDto>;
    pub fn release_audio(&self, session_id: &str);
    pub fn finish_audio(&self, session_id: &str, job: &Arc<AtomicBool>, outcome: Result<std::fs::File, AudioFallbackError>) -> Result<String, ErrorDto>;
}
```

- `begin_audio`: unknown session → `preview.cancelled`; `Running` → `preview.cancelled`; `Ready` → its URL; `Empty` → set `Running`.
- `finish_audio`: session gone, or slot not `Running` with a flag `Arc::ptr_eq` to `job` → drop the file and return `preview.cancelled`; failure → slot back to `Empty` and the mapped error; success → `publish_file(file, len, "audio/wav")` (memory only; `len` is read before the lock), slot `Ready`, URL returned; if publishing fails, slot `Empty`, file dropped, `core.io`.
- `release_audio`: unknown session → nothing; otherwise set the flag of a running job, revoke a ready token, slot `Empty`; the revoked entry is dropped after the lock.
- Closing, replacing or shutting down a session sets the cancel flag of a running job, revokes both tokens, and drops the slot. One private function `retire(server, session)` does this for all three and returns the revoked entries, which the caller drops after releasing the lock. Nothing but a stream being stopped holds the file after that; there is no startup sweep.
- The frontend issues at most one preparation per session at a time, from an event handler and not from an effect; refusing a second one is the backend's guard.

### D3a Serving an open file (`media_server.rs`)

`Entry` holds `source: Source` instead of `path`, with `enum Source { Path(PathBuf), File { file: Arc<std::fs::File>, len: u64 } }`, and `pub fn publish_file(&self, file: std::fs::File, len: u64, content_type: &'static str) -> std::io::Result<Published>`. For `File`, each 64 KiB chunk is read in `spawn_blocking` with a positioned read: `std::os::unix::fs::FileExt::read_at`, or `std::os::windows::fs::FileExt::seek_read`; both take an explicit offset, so concurrent streams do not disturb each other. The response task clones the `Arc` and drops it when it ends, revocation included; a read in flight keeps it until that read returns. Media keeps `Path`, so its own file is reopened per request.

### D4 Commands

`prepare_preview_audio(session_id: String, state) -> Result<PreviewAudioDto, ErrorDto>` with `PreviewAudioDto { url: String }`. `release_preview_audio(session_id: String, state) -> Result<(), ErrorDto>`, idempotent. `prepare_preview_audio` calls `begin_audio`, `spawn_blocking(decode_to_wav)`, `finish_audio`. A panicked task calls `finish_audio` with `Unsupported("the decoding task panicked")`.

### D5 Fixtures

Committed, generated once, commands recorded in `src-tauri/tests/fixtures/README.md`:

```bash
ffmpeg -f lavfi -i 'sine=f=440:r=8000:d=0.5' tone.wav
ffmpeg -itsoffset 2 -i tone.wav -c:a flac late.mkv      # about 2.5 KB
ffmpeg -f lavfi -i 'sine=f=440:r=48000:d=0.5' -c:a libopus opus.mkv
```

Only `late.mkv` and `opus.mkv` are committed. Tests read them through `env!("CARGO_MANIFEST_DIR")`. Other inputs (mono and stereo PCM WAV) are written by the test.

## Risks / Trade-offs

- [A cancelled job notices the flag only between packets] → its partial file lives until the packet read in progress returns, which a stuck network mount can delay.
- [Decoding reads the whole container, video packets included, possibly from a slow mount] → the time is unbounded; leaving the step cancels it.
- [MP4 edit lists are ignored] → corrected or refused by `guard-mp4-preview-audio`, which must land before the player.
- [The system temporary directory may be in memory] → two hours of 48 kHz mono is about 690 MB there. Writing stops with `core.io` when it is full.
- [A normal exit does not drop managed state] → the exit hook of `add-sync-media-server` calls `shutdown`, which retires the session. A crash leaves no named file on Unix, except between create and unlink on systems without `O_TMPFILE`; on Windows the OS deletes it when the process's handles close, which a power loss can prevent.
- Audible output is unverified: the probe behind the design was muted.
