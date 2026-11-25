# Design

## Context

Approved design: `docs/superpowers/specs/2026-11-25-sync-preview-design.md`, "Audio fallback". Read in `symphonia-format-isomp4` 0.5.5: `Track::id` is the zero-based index of the `trak` in `moov`; timestamps come from `stts` (time base 1/media timescale) and never use `elst`; a fragment's first timestamp is the end of the previous segment, and `tfdt` is not read; a file without `ftyp` is rejected. Measured on generated files: plain AAC has one edit with `media_time` 1024 (priming); a 2 s late start has an empty edit of 1976 movie ticks (timescale 1000) and then `media_time` 0; Symphonia starts both at `ts=0`.

## Goals / Non-Goals

**Goals:** WAV time equals presentation time, or refusal.

**Non-Goals:** multi-edit playback, checking fragments after the first, the engine's detection (which ignores edits too).

## Decisions

### D1 `src-tauri/src/mp4_timing.rs`

```rust
pub enum Mp4TimingError { Io(std::io::Error), Malformed(&'static str), Unsupported(&'static str) }
#[derive(Debug, PartialEq)]
pub struct EditMap {
    pub movie_timescale: u32,
    pub media_timescale: u32,
    pub empty_ticks: u128,          // movie ticks
    pub trim_ticks: u64,            // media ticks
    pub segment_ticks: Option<u64>, // movie ticks; None = to the end
}
/// `None` when the file is not MP4 (no `ftyp` at byte 4).
pub fn edit_map<R: Read + Seek>(reader: &mut R, track_index: usize) -> Result<Option<EditMap>, Mp4TimingError>;
```

Rule, for the track at `track_index` among `moov/trak` in file order:

1. No `edts`, no `elst`, or zero entries: nothing empty, trim 0, segment `None`.
2. Leading entries with `media_time == -1` are empty edits; `empty_ticks` is their sum.
3. Then exactly one entry with `media_time >= 0` and rate 1.0 (`1`, `0`): `trim_ticks = media_time`, `segment_ticks = segment_duration`, or `None` when it is 0 or `moov/mvex` exists. Trailing empty entries are ignored. Anything else, including only empty edits and `media_time < -1` → `Unsupported`.
4. With `moov/mvex`: find the first `moof` whose `traf/tfhd` track id equals the track's `tkhd` id. A `tfdt` other than 0 → `Unsupported`; no `tfdt` is 0; no such `moof` is `Malformed`.

AAC priming without an edit list is not trimmed: the container does not declare it as hidden, so it is part of the presentation. Video edits are not consulted: the selected track's own edits already give its place on the movie timeline, whether or not the video has equal ones.

Media past the segment is dropped because it is not presented; a player honouring the edit ends there too. A zero duration and fragmented files are exempt because writers use them for "unknown".

### D2 Bounded parsing

Boxes are walked with `Seek`; payloads are never loaded whole. Sizes: 32-bit; `1` → 64-bit follows; `0` → to the end of file, top level only. A size below its header or beyond its parent → `Malformed`. At most 100 000 boxes per container and 4096 `trak`s, and 1024 `elst` entries, each limit exceeded → `Malformed`; entry count must fit the box. More than one `moov`, `edts`, `elst`, `mvhd`, `mdhd` or `tkhd` where one belongs, a missing `mvhd`, `mdhd` or `tkhd`, a zero timescale, an unknown version, or an out-of-range `track_index` → `Malformed`. The top-level walk always reaches the end of file for a non-fragmented file, because a second `moov` must be noticed; `mdat` is skipped by seeking. For a fragmented file it also stops at the first matching `moof` after `moov`. Versions 0 and 1 of `mvhd`, `mdhd`, `tkhd`, `elst`, `tfdt` are read.

At most 200 000 boxes are visited in total. Fields, big-endian, offsets after the box header and the 4-byte version/flags:

| Box | version 0 | version 1 |
|---|---|---|
| `mvhd`, `mdhd` | timescale u32 at 8 | timescale u32 at 16 |
| `tkhd` | track id u32 at 8 | track id u32 at 16 |
| `elst` | entry count u32 at 0; 12-byte entries: duration u32, media_time i32, rate i16, i16 | count u32 at 0; 20-byte entries: duration u64, media_time i64, rate i16, i16 |
| `tfhd` | track id u32 at 0 (any version) | same |
| `tfdt` | u32 at 0 | u64 at 0 |

### D3 Use

`decode_with` opens a second `File` in a `BufReader` and calls `edit_map` with `track.id as usize` (the `trak` position, see Context) after choosing the track and before calling `make`. `Malformed` → `AudioFallbackError::Unsupported`; `Io` → `Unreadable`, except `UnexpectedEof`, which is `Malformed`; `Unsupported` → new variant `AudioFallbackError::Timing(String)`, mapped to `preview.audio_timing_unsupported`. `preview.audio_unsupported` would wrongly say the format cannot be decoded.

Frames, all `u128`/`i128` integer arithmetic, with `near(a, b)` = round half up of `a / b` for `a >= 0` and the mirrored rule for `a < 0`:

- `lead = near(empty_ticks * rate, movie_timescale)`.
- `end = lead + ceil(segment_ticks * rate / movie_timescale)`, or none.
- Per packet `rel = near((ts - trim_ticks) * rate, media_timescale)`; if negative, drop the first `-rel` decoded frames (all, if there are fewer) and use 0; then `start = lead + rel`.

Each of the two roundings is at most half a sample, so a sample is at most one sample from its presentation time. Trimming happens before the delay is added; otherwise the trimmed frames would land inside the silence.

`TimelineWriter` gains `lead_silence(&mut self, frames: u128, cancel)`, called once before the first packet, and `set_end(Option<u64>)`. `lead_silence` applies the WAV size check to the whole amount first, then writes in chunks of at most 8192 frames checking `cancel` per chunk, and advances `written_frames`. It is explicit because `push` would absorb a delay within the 20 ms jitter tolerance. `push` clips samples and gap silence at `end` and returns `Ok(true)` once `written_frames` reaches it, which ends the packet loop. "No frame written" counts kept decoded frames only, not silence. The order is: `make`, header, `lead_silence`, packets.

A delay cannot be counted twice: Symphonia's MP4 `ts` starts at 0 regardless of edits, `lead` is added to every `start`, and `written_frames` already contains it, so `push` sees the first packet as contiguous. Matroska and the other containers have their delay in `packet.ts`; for them `edit_map` is `None`, `lead` is 0, no end is set, and the mapping of `add-sync-audio-fallback` is unchanged.

### D4 Fixtures

Same generation rules as `add-sync-audio-fallback` D5: `ffmpeg -i tone.wav -ar 44100 -c:a aac priming.mp4` and `ffmpeg -itsoffset 2 -i tone.wav -ar 44100 -c:a aac late.mp4`, about 5.5 KB each. All other cases are built in memory by a test helper that writes boxes.

## Risks / Trade-offs

- [Some valid files (multi-edit, rate change, late first fragment) are refused] → sound-only preview is unavailable with a specific message; offset editing continues.
- [A wrong `segment_duration` written by a muxer cuts the preview's end] → accepted; the presentation ends there for a conforming player as well. A duration rounded to movie ticks may cut less than one tick.
- [A hostile delay just under the WAV limit writes up to 4 GiB of silence] → bounded by that limit, cancellable, and a full disk is `core.io`.
- [A fragmented file with a gap after its first fragment is not detected] → recorded; reported to the owner.
- [A fragmented file that also has samples in `moov` has a first `tfdt` after them] → refused although playable; rare, and refusal is the safe side.
- [HE-AAC output rate may differ from the declared rate] → already refused by the rate check of `add-sync-audio-fallback`.
