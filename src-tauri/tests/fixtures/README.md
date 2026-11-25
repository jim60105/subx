# Test fixtures

Binary media for the sync preview's audio fallback tests
(`src-tauri/src/audio_fallback.rs`, `commands/preview.rs`, `ipc_tests.rs`).
They are generated once and committed; regenerate them only with these
commands (FFmpeg 8.0 was used):

```bash
ffmpeg -f lavfi -i 'sine=f=440:r=8000:d=0.5' tone.wav
ffmpeg -itsoffset 2 -i tone.wav -c:a flac late.mkv      # about 2.5 KB
ffmpeg -f lavfi -i 'sine=f=440:r=48000:d=0.5' -c:a libopus opus.mkv
```

`tone.wav` is an intermediate and is not committed.

- `late.mkv`: 0.5 s of 8 kHz mono FLAC in Matroska whose audio packets start at
  2 s (`pts=2000, 2072, 2144` with a 1/1000 s time base). Decoding it must
  yield 2 s of silence followed by the tone.
- `opus.mkv`: Opus in Matroska, which has no decoder in the build and must be
  refused as unsupported.

Other inputs (mono and stereo PCM WAV) are written by the tests themselves.
