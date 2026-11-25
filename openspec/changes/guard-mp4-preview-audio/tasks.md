# Tasks

Boundaries: edit only the files named below. Tests for this change's scenarios stay without `// @covers`; annotations are added at archive. If `ffmpeg` is missing, stop and report; do not hand-write fixtures.

## 1. Parser

- [ ] 1.1 Create `src-tauri/src/mp4_timing.rs` per design D1 and D2, declare it in `lib.rs`. In its tests, a helper builds `ftyp`, `moov` (v0/v1, any number of traks with edits) and `mdat` in a `Vec<u8>`; one test per scenario except the two that decode, each limit of D2 once, a 64-bit box size, and a non-MP4 input giving `None`. Verify: `cargo test --manifest-path src-tauri/Cargo.toml mp4_timing`.

## 2. Decoder

- [ ] 2.1 Apply D3 to `audio_fallback.rs` and `commands/preview.rs`; add the fixtures of D4 and `two.mp4` (`ffmpeg -i priming.mp4 -itsoffset 2 -i priming.mp4 -map 0:a -map 1:a -c copy two.mp4`; inspect that the first audio track has no empty edit and the second has one, and stop and report otherwise) and their commands to the fixtures README. Tests: `priming.mp4` decodes to at least 22050 and fewer than 23074 frames; `late.mp4` gives `Timing` through `decode_into` with a directory that does not exist (proving that no temporary file is attempted); "Selected track decides" through `decode_into` on `two.mp4`, whose second audio track alone has the 2 s delay; `push` with a start of −5 drops exactly 5 frames; the code mapping for `Timing`. Verify: `cargo test --manifest-path src-tauri/Cargo.toml audio_fallback` and `... preview`.
- [ ] 2.2 Add `preview.audio_timing_unsupported` to `src/locales/{en,zh-TW}/errors.json` (meaning: the sound's start time in this file cannot be reproduced, so the sound-only preview is not offered). Verify: `npx vitest run src/i18n src/styles/fontCoverage.test.ts`.
- [ ] 2.3 Run `openspec validate guard-mp4-preview-audio --strict` and `npm run verify`. Expected: both exit 0.

## Workflow follow-up

- At archive, after `openspec archive guard-mp4-preview-audio --yes`, add `// @covers` lines with the ids from `npm run spec:trace -- --report`.
