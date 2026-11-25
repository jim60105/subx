# Tasks

Boundaries: edit only the files named below. Tests for this change's scenarios stay without `// @covers`; annotations are added at archive. If `ffmpeg` is missing, stop and report; do not hand-write fixtures.

## 1. Parser

- [ ] 1.1 Create `src-tauri/src/mp4_timing.rs` per design D1 and D2, declare it in `lib.rs`. In its tests, a helper builds `ftyp`, `moov` (v0/v1, any number of traks with edits) and `mdat` in a `Vec<u8>`; one test per scenario that concerns parsing (timescales, selected track, complex lists, versions and orders, late fragment, malformed), one for zero duration and for `mvex` giving no segment, each limit of D2 once, a 64-bit box size, and a non-MP4 input giving `None`. Verify: `cargo test --manifest-path src-tauri/Cargo.toml mp4_timing`.

## 2. Decoder

- [ ] 2.1 Apply D3 to `audio_fallback.rs` and `commands/preview.rs`, updating every existing `push` call and test for its new result type; add the fixtures of D4 and `two.mp4` (`ffmpeg -i priming.mp4 -itsoffset 2 -i priming.mp4 -map 0:a -map 1:a -c copy two.mp4`; inspect that the first audio track has no empty edit and the second has one, and stop and report otherwise) and their commands to the fixtures README. Tests on the fixtures: `priming.mp4` gives exactly 22050 frames whose first 1000 equal frames 1024 to 2023 of an untrimmed decode (`decode_core` with `|_, _| Ok(None)`); `late.mp4` gives 87142 zero frames, a sample above 100 in magnitude within the next 3000, and at most 110251 frames in total; "Selected track decides" on `two.mp4` (22050 frames, no silence) and `video_first.mp4` (14976 zero frames, then sound within 3000). Tests on `TimelineWriter` and the frame formulas with synthetic packets: every other non-parsing scenario, rounding at a half sample, a fully trimmed packet, `trim` past all media (`Unsupported`), an end inside a gap, and no double delay (first packet after `lead_silence` adds no further zero). Equal and video-only edits: parser helper plus formulas. A complex edit list gives `Timing` through `decode_with` whose `make` panics if called: copy `priming.mp4` to a temporary file with the rate bytes of its only `elst` entry (byte 20 after the start of the `elst` type) changed from `00 01` to `00 02`. Likewise setting its entry count (byte 8) to 1000 gives `Unsupported`. A delay with no kept frame gives `Unsupported` (`decode_core` on `priming.mp4` with a map trimming `u32::MAX` ticks and a 100-tick delay). The hostile-limit scenario uses a small `max_data_bytes`; write no large file. The code mapping for `Timing`. Verify: `cargo test --manifest-path src-tauri/Cargo.toml audio_fallback` and `... preview`.
- [ ] 2.2 Add `preview.audio_timing_unsupported` to `src/locales/{en,zh-TW}/errors.json` (meaning: the sound's timing in this file cannot be reproduced, so the sound-only preview is not offered). Verify: `npx vitest run src/i18n src/styles/fontCoverage.test.ts`.
- [ ] 2.3 Run `openspec validate guard-mp4-preview-audio --strict` and `npm run verify`. Expected: both exit 0.

## Workflow follow-up

- At archive, after `openspec archive guard-mp4-preview-audio --yes`, add `// @covers` lines with the ids from `npm run spec:trace -- --report`.
