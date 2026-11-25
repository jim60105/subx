# Tasks

Boundaries: edit only the files named below; the frontend UI is not touched. Tests for this change's scenarios stay without `// @covers`; annotations are added at archive.

## 1. Decoder

- [ ] 1.1 Edit `Cargo.toml` per design D1. Verify: `cargo check --manifest-path src-tauri/Cargo.toml`; `git diff src-tauri/Cargo.lock` adds no package block.
- [ ] 1.2 Add the fixtures and their README per D5. If `ffmpeg` is not installed, stop and report; do not hand-write fixtures. Verify: `late.mkv` is under 10 KB and `opus.mkv` under 20 KB.
- [ ] 1.3 Create `audio_fallback.rs` per D2. Unit tests on `TimelineWriter` over `Cursor<Vec<u8>>` for the gap, jitter, overlap, oversize (small `max_data_bytes`, asserting the bytes already written stay within it) and write-failure (a `Write + Seek` that errors) scenarios, plus cancellation during silence filling. Verify: `cargo test --manifest-path src-tauri/Cargo.toml audio_fallback`.
- [ ] 1.3a Extend `media_server.rs` per D3a; tests for `Source::File`: a range, "Ranges are served from the open file" (two connections at once on a 4 MiB patterned file), and revocation of a running stream after which a `Weak` to the file cannot be upgraded (poll up to two seconds). Verify: `cargo test --manifest-path src-tauri/Cargo.toml media_server`.
- [ ] 1.4 Tests on `decode_to_wav`: `late.mkv` (first 16000 frames are zero, a non-zero sample follows within 1000 frames, header sizes match the file length, total within 1000 frames of 20000); a written stereo WAV with constant channels 1000 and 3000 (mono, samples 2000 ± 1, source rate); `opus.mkv` (`Unsupported`); a text file (`Unsupported`); a missing file (`Unreadable`); a set cancel flag (`Cancelled`). To assert that no file remains, factor `decode_to_wav` as a wrapper over `decode_into(media, cancel, dir: &Path)` using `tempfile::tempfile_in(dir)`, and assert the test's `TempDir` is empty after each failure and cancellation, and under `cfg(unix)` also while a successful result is held ("Prepared audio has no name"). Verify: same command.

## 2. Session and command

- [ ] 2.1 Extend `PreviewState` per D3. Tests, one per scenario of "Preview audio belongs to its session": drive `begin_audio` / `finish_audio` directly for the concurrent and stale cases and for an `Io` outcome (`core.io`, slot back to `Empty`), and for closing, replacement, shutdown and release assert that a test accessor's `Weak<File>` cannot be upgraded, the cancel flag of a running job is set, and the URL answers 404; for "Superseded job cannot publish" release, begin again and finish with the first flag. Verify: `cargo test --manifest-path src-tauri/Cargo.toml preview`.
- [ ] 2.2 Add both commands and the DTO per D4, register them, extend `COMMANDS` to 27, add an IPC round trip of both on `late.mkv`. Verify: `cargo test --manifest-path src-tauri/Cargo.toml`.
- [ ] 2.3 `npm run bindings:generate`, re-export `PreviewAudioDto` in `src/types/ipc.ts`, add both codes to `src/locales/{en,zh-TW}/errors.json`. Verify: `npx vitest run src/i18n` and, with `bindings.ts` staged, `npm run bindings:check`.
- [ ] 2.4 Run `openspec validate add-sync-audio-fallback --strict` and `npm run verify`. Expected: both exit 0.

## Workflow follow-up

- At archive, after `openspec archive add-sync-audio-fallback --yes`, add `// @covers` lines to the tests of 1.3, 1.4, 2.1 and 2.2 with the ids from `npm run spec:trace -- --report`.
