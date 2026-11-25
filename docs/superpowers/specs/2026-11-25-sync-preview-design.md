# Sync Preview — Design

Date: 2026-11-25
Status: design approved; written spec awaiting owner review; proposed as OpenSpec changes `add-sync-media-server`, `add-sync-audio-fallback`, `rework-sync-detection-flow`, `add-sync-preview-player`, `add-sync-time-rule` and `package-sync-preview-media`, in that order

## Goal

In the sync wizard the user cannot tell whether an offset is right. Add a
preview that plays the selected media with the subtitle over it, on the same
page as the offset controls, so the offset can be adjusted while it plays.

Reference mockup (not shipped, git-ignored), layout **C**:
`.superpowers/brainstorm/847440-1795612948/content/sync-preview-v1.html`.

## Decisions

| Topic | Decision |
|---|---|
| Picture | Shown when the WebView can decode it; otherwise sound and subtitle only |
| Flow | Step 2 asks whether to detect; step 3 alone holds preview and offset editing |
| Step 3 layout | C: player, time rule, transport, then one row of offset controls |
| Media delivery | Loopback HTTP on all three platforms; no asset protocol |
| Audio fallback | Backend decodes to a temporary WAV, served by the same server |
| Offset model | One global offset, so no cue list and no per-cue editing |
| Audio track | The WebView's default track; no track switcher |
| Visual style | Existing tokens only; no new colour token |

Out of scope: cue list, per-cue timing, waveform of real audio, dragging cues,
track switching, transcoding, ASS styling or positioning.

## Why not the asset protocol

Tauri's `asset:` protocol and `convertFileSrc` are not used for media.

- [tauri#3725](https://github.com/tauri-apps/tauri/issues/3725), "Loading a
  video/audio as an asset does not work", has been open since 2022-03-17 and
  was still open on 2026-11-25. A maintainer reproduced it and attributed it to
  webkit2gtk. Another maintainer stated that local media through
  `convertFileSrc` has "No fix available right now", even with GStreamer
  installed. The upstream bug is
  [WebKit 146351](https://bugs.webkit.org/show_bug.cgi?id=146351).
- [tauri PR 14402](https://github.com/tauri-apps/tauri/pull/14402), which added a
  GStreamer handler for `asset://`, was closed without being merged.
- We reproduced the failure class locally on WebKitGTK 2.54.2: the same MP4
  failed with media error 4 through a registered custom scheme and played over
  loopback HTTP. The probe registered its own scheme; it did not run Tauri's
  handler.
- A maintainer reports no such issue on Windows and macOS. We still use one
  delivery path everywhere: a second one would need its own range, scope and
  lifetime handling, and the Linux path would remain mandatory.

A `blob:` URL is also rejected: it would load a whole multi-gigabyte file into
memory.

### Probe evidence and its limits

On the same machine (Fedora, WebKitGTK 2.54.2, GStreamer 1.28.9), over loopback
HTTP with Range, all of these loaded, seeked to the middle and advanced: H.264 +
AAC in MP4; H.264 + AC-3, H.264 + Opus and HEVC 10-bit + AAC in MKV; and the
owner's 1.8 GB 1080p H.264 MKV with two FLAC tracks on a NAS (metadata 355 ms,
seek 356 ms). Playback was muted, so audible output is **not** proven. Windows
and macOS are **not** tested.

## Flow

| Step | Content |
|---|---|
| 01 Files | Unchanged, except that window drops are accepted only here |
| 02 Detect | Ask, sensitivity slider, waiting UI, failure and retry |
| 03 Offset | Player, time rule, offset controls, detection facts and warnings |
| 04 Save | Unchanged |

Step 2 has three states.

- **Ask.** Actions: Back, Skip, Start detection. `sync.default_method = manual`
  makes Skip the primary action; otherwise Start detection is primary. The
  method radio group is removed. `WizardShell`'s `secondary` slot may hold the
  non-primary choice, and its contract comment is updated to say so.
- **Detecting.** Shown in step 2. Cancel returns to Ask and discards any late
  result, through the existing epoch guard. Success advances to step 3 with the
  detected offset.
- **Failed.** Shows the error; Retry and Skip are available.

Rules:

- Skip enters step 3 with offset 0 and no detection facts. Without media, Skip
  is the only forward action and the reason is shown.
- Going back from step 3 keeps the offset until the user skips (reset to 0) or
  a detection succeeds (overwritten). A failed or cancelled detection leaves it.
- Changing either file in step 1 resets the offset and detection.
- Offsets beyond `sync.max_offset_seconds` block Continue in step 3. A detected
  offset beyond the limit still enters step 3, where it can be reduced.

## Step 3 interface

From top to bottom:

1. **Stage.** Takes the remaining height; picture is contained and centred on
   `--paper-2` under a 2px `--ink` rule. The current cue is a slip: `--paper`
   background, `--ink` text, 2px `--accent` inline-start edge. Contrast therefore
   never depends on the picture.
2. **Time rule.** A 74px strip with one-second ticks and a fixed centre needle.
   Real cues scroll past it: hollow bars are the original times, solid bars the
   shifted times, and the cue under the needle is `--accent`. Only cues in the
   visible window are rendered. It contains no audio data, is hidden from
   assistive technology, and cannot be dragged. It replaces the schematic
   `OffsetPreview`, which is removed.
3. **Transport.** Play/pause, position and duration, seek bar, volume, and a
   "No sound?" button that switches to audio mode.
4. **Offset row.** Serif figure, −50 / +50 ms buttons, millisecond field, and
   the detected offset and confidence when a detection exists. Detection
   warnings follow as `ErrorNotice`s.

At 860×600 the stage shrinks first and the offset row stays visible without
scrolling when there is no notice. If notices do not fit, the step scrolls.

Motion uses the existing tokens: the figure moves in the direction of the
change, the slip enters with `--motion-fast`. Reduced motion removes both, and
the step 2 bars hold still.

The step 2 bars are decorative and hidden from assistive technology; elapsed
seconds are the only progress shown.

Media starts paused, with sound on. Space keeps its native meaning on the
focused control; no global shortcuts are added. Every control has a localized
name in `en` and `zh-TW`.

### Timing rule

`shift(t) = max(0, t + offset_ms)` for both start and end, matching
`shift_subtitle`. A cue is shown when `shift(start) <= position < shift(end)`.
Overlapping cues are shown together, in file order, on separate lines. A cue
clamped to zero length is not shown. Saved and previewed times agree within
1 ms, because apply computes in `f32` seconds.

The offset is applied in the frontend on each animation frame, so changing it
does not reload media, seek, or pause playback. Frames are requested only while
playing; a seek or offset change while paused redraws once.

## Frontend units

| Unit | Responsibility |
|---|---|
| `useSyncWizard` | Flow above; owns `offsetMs` and detection |
| `usePreviewSession` | Opens and closes the backend session; owns the media state machine |
| `cueTiming.ts` | Pure: shift, active cues, visible window |
| `SyncPlayer` | `<video>`, slip and transport; reports position |
| `TimeRule` | Draws cues from position and offset |
| `OffsetField` | Figure, nudge, millisecond input |

Cue text is rendered as text nodes only. ASS override blocks and HTML-like tags
are removed and ASS line breaks become newlines; markup is never interpreted.

### Media states

```text
no media ──────────────────────────▶ none
opening ──▶ video ──error / "No sound?"──▶ preparing ──▶ audio
   │                                           └─error──▶ unavailable
   └─error ────────────────────────────────────────────▶ unavailable
```

- Video without a decodable picture but with playing sound is not an error: the
  stage shows the audio-mode mark.
- A `<video>` error moves to `preparing` automatically, with the reason shown.
- A video that stays silent cannot be detected portably, hence the button. The
  switch keeps position, play state and volume. When it fails from a playable
  video, the user can return to video.
- `none`, `preparing` and `unavailable` never block offset editing or Continue.
- A subtitle that fails to load shows its error in place of the rule and slip.
  Playback still works; Continue stays available and save reports its own error.

## Backend units

| Unit | Responsibility |
|---|---|
| `media_server.rs` | Loopback server, token registry, Range responses |
| `audio_fallback.rs` | Decode the audio track to a temporary WAV; cancellable |
| `commands/preview.rs` | Thin commands delegating to plain functions |

Commands, all in the `COMMANDS` allowlist and the generated bindings:

- `load_preview_cues(subtitle_path)` → `[{ startMs, endMs, text }]` as `u32`,
  in file order, using the same `FormatManager` loader as apply.
- `open_preview(media_path)` → `{ sessionId, url }`. Replaces any open session.
- `prepare_preview_audio(session_id)` → `{ url }`.
- `close_preview(session_id)` → idempotent; a stale id never closes a newer one.

New error codes: `preview.media_unreadable`, `preview.server_unavailable`,
`preview.audio_unsupported`, `preview.cancelled`. Each has `en` and `zh-TW` text.
`preview` is added to the code-parity test.

### Media server

Built on `hyper` 1.x, `hyper-util` and `http-body-util`, already in the
dependency tree. It starts on first use and binds `127.0.0.1` on an OS-chosen
port, never `0.0.0.0`.

- `GET` and `HEAD` only (405 otherwise). Single byte ranges: 206, 416 when
  unsatisfiable, and 200 for a missing, malformed or multi-range header.
  Bodies are streamed in bounded chunks.
- URL: `/<token>`, with a fresh 128-bit `getrandom` token per resource. It
  contains no file path; unknown tokens get 404.
- `Host` must be `127.0.0.1:<port>` (DNS rebinding), else 403. No CORS headers,
  and `Cache-Control: no-store`.
- A token maps to one regular file chosen by the command; the server never
  resolves a path from a request. Tokens are never logged.
- Closing a session revokes its tokens, stops its streams and deletes its WAV.
  Leaving step 3, changing files, finishing and unmounting all close it; app
  exit stops the server. WAVs stranded by a crash are left to the OS temp
  directory's cleanup.

CSP gains only `media-src 'self' http://127.0.0.1:*`. CSP cannot name a random
port; the token is what authorizes access. Any local process of any user can
reach the port, but not a resource without its token.

### Audio fallback

Uses Symphonia 0.5 as a direct dependency with the features `subx-core` enables
(`isomp4`, `mkv`, `ogg`, `wav`, `aac`, `flac`, `mp3`, `pcm`, `vorbis`). It
therefore has no AC-3, DTS or Opus decoder; those report
`preview.audio_unsupported`.

The engine's public `DirectAudioLoader` is not reused: it concatenates decoded
samples and ignores packet timestamps, so a track that starts late would make
the preview wrong. It also holds all samples in memory and cannot be cancelled.

- Picks the first track with a sample rate, like detection does.
- Maps packet timestamps to the output and inserts silence for a late start or
  gaps, with tolerance for timestamp jitter; overlaps are trimmed.
- Downmixes to mono 16-bit at the source rate and streams to a file under the
  system temporary directory. Output that would exceed the WAV size limit is an
  error, and a full disk is reported rather than truncated.
- Runs in `spawn_blocking` with a cancellation flag checked per packet; a
  cancelled job deletes its partial file. One job per session.

## Packaging

- AppImage: `bundle.linux.appimage.bundleMediaFramework: true`.
- deb: recommend `gstreamer1.0-plugins-base`, `-good` and `gstreamer1.0-libav`.
- Flatpak: add `--socket=pulseaudio`; the manifest grants no audio today. Verify
  H.264 and AAC in GNOME runtime 50 and add the codecs extension if missing.
- macOS: verify that the page may load `http://127.0.0.1` media; if App Transport
  Security blocks it, add `NSAllowsLocalNetworking`. If WKWebView blocks it as
  mixed content, the preview reports `unavailable`. The asset protocol is not a
  fallback.

## Spec changes

The OpenSpec change modifies `sync-workflow`: method selection, detection and
review, and the schematic-preview requirement; and adds preview requirements.
Documentation and the changelog are updated with the new flow.

## Verification

Rust: range boundaries, HEAD, wrong method, unknown and revoked token, wrong
Host, session replacement and stale close; WAV with a late-starting track,
gaps, cancellation and cleanup; cue loading; IPC allowlist.

Frontend: each flow path in this document, shift and activity boundaries,
negative clamp, overlapping cues, markup stripping, every media state, offset
change without reload, reduced motion, locale parity. jsdom plays no media, so
media events are simulated.

`npm run verify` must pass. `agent-browser` checks light and dark at 1100×720
and 860×600.

Manual, in the real app on Linux: the owner's MKV is **audible**, seeks, and
agrees with the saved subtitle at the start, middle and end. Flatpak and
AppImage are checked for sound. Windows and macOS are reported as unverified
unless actually run.
