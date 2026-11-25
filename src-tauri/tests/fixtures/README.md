# Test fixtures

Binary media for the sync preview's audio fallback tests
(`src-tauri/src/audio_fallback.rs`, `commands/preview.rs`, `ipc_tests.rs`).
They are generated once and committed; regenerate them only with these
commands (FFmpeg 8.0 was used):

```bash
ffmpeg -f lavfi -i 'sine=f=440:r=8000:d=0.5' tone.wav
ffmpeg -itsoffset 2 -i tone.wav -c:a flac late.mkv      # about 2.5 KB
ffmpeg -f lavfi -i 'sine=f=440:r=48000:d=0.5' -c:a libopus opus.mkv
ffmpeg -i tone.wav -ar 44100 -c:a aac priming.mp4                # about 5.5 KB
ffmpeg -itsoffset 2 -i tone.wav -ar 44100 -c:a aac late.mp4      # about 5.5 KB
ffmpeg -i priming.mp4 -itsoffset 2 -i priming.mp4 -map 0:a -map 1:a -c copy two.mp4
ffmpeg -f lavfi -t 1 -i testsrc=s=32x32:r=10 -itsoffset 2 -i tone.wav \
  -c:v mpeg4 -c:a aac video_first.mp4
```

`tone.wav` is an intermediate and is not committed.

- `late.mkv`: 0.5 s of 8 kHz mono FLAC in Matroska whose audio packets start at
  2 s (`pts=2000, 2072, 2144` with a 1/1000 s time base). Decoding it must
  yield 2 s of silence followed by the tone.
- `opus.mkv`: Opus in Matroska, which has no decoder in the build and must be
  refused as unsupported.
- `priming.mp4`: 44.1 kHz AAC whose one edit has media time 1024 (the encoder
  priming) and lasts 500 ms at movie timescale 1000. Decoding it must trim the
  priming and yield exactly 22050 frames.
- `late.mp4`: the same tone 2 s late: an empty edit of 1976 movie ticks, then
  media time 0 for 524 ticks. Decoding it must yield 87142 zero frames first.
- `two.mp4`: two audio tracks; the first has `priming.mp4`'s edit, the second
  `late.mp4`'s. Only the first is decoded, so no silence leads.
- `video_first.mp4`: an undelayed video track, then 8 kHz AAC with an empty edit
  of 1872 movie ticks. Decoding it must yield 14976 zero frames first.

Other inputs (mono and stereo PCM WAV) are written by the tests themselves.
