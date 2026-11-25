# Design

## Context

Approved design: `docs/superpowers/specs/2026-11-25-sync-preview-design.md`, "Step 3 interface", "Timing rule", "Media states". Layout C (the `rule` layout) of `.superpowers/brainstorm/847440-1795612948/content/sync-preview-v1.html`. Media arrives over loopback HTTP, never the asset protocol (`add-sync-media-server` design D1, https://github.com/tauri-apps/tauri/issues/3725).

Available from earlier changes: `commands.loadPreviewCues`, `openPreview`, `preparePreviewAudio`, `releasePreviewAudio`, `closePreview`; `SyncOffsetStep` with props `{ defaults, detection, offsetMs, offsetExceedsMax, onOffsetChange }`.

Contradiction with the design document, kept visible: it says saved and previewed times agree within 1 ms. Apply computes in `f32` and does, but the engine then writes ASS in centiseconds (truncated, up to 10 ms) and MicroDVD SUB in whole frames at 25 fps (up to 20 ms). The requirement therefore compares before the format's rounding.

## Goals / Non-Goals

**Goals:** player, slip, media states, session lifetime.

**Non-Goals:** time rule, offset row restyling, removal of `OffsetPreview` (next change); cue list, waveform, track choice, ASS styling, global shortcuts, backend changes.

## Decisions

### D1 Pure modules

```ts
// cueTiming.ts
import type { PreviewCueDto } from "../../types/ipc";
export function shiftMs(timeMs: number, offsetMs: number): number; // Math.max(0, t + o)
export function activeCues(cues: readonly PreviewCueDto[], positionMs: number, offsetMs: number): PreviewCueDto[];
// cueText.ts
export function plainCueText(text: string): string;
```

`plainCueText`, in order: remove `/\{\\[^{}]*\}/g`; remove `/<\/?(?:[A-Za-z]|\d{2}:)[^<>]*>/g`; replace `\N` and `\n` (backslash sequences) with a newline and `\h` with a space; trim. Braces without a leading backslash and a lone `<` stay. Cues whose plain text is empty are not rendered.

### D2 `previewApi.ts`

Wrappers over `commands`: `loadPreviewCues(path)`, `openPreview(path)`, `preparePreviewAudio(id)`, `releasePreviewAudio(id)`, `closePreview(id)`. Separate from `syncWizardApi.ts` so that the existing automocks of that module keep working.

### D3 `usePreviewSession(mediaPath, subtitlePath)`

```ts
export type PreviewMedia =
  | { status: "none" }
  | { status: "opening" }
  | { status: "video"; url: string }
  | { status: "preparing"; reason: "failed" | "requested" }
  | { status: "audio"; url: string }
  | { status: "unavailable"; error: unknown; canReturn: boolean };
export interface PreviewSession {
  media: PreviewMedia;
  cues: readonly PreviewCueDto[];
  cueError: unknown;
  onMediaError: () => void;
  requestAudio: () => void;
  returnToVideo: () => void;
}
```

- Session calls go through one module-level promise chain (`let queue: Promise<unknown> = Promise.resolve()`; `enqueue(fn)` runs `fn` after the previous settles, swallowing its rejection for the chain). `openPreview` and `closePreview` are enqueued; `preparePreviewAudio` is not, so `closePreview` can cancel it.
- Effect on `[mediaPath]`: null → `none`; otherwise `opening`, then enqueue open. If the effect was cleaned up before the open resolved, enqueue nothing further but call `closePreview(id)` inside the same queued function, so it finishes before any newer open. Cleanup with an open session enqueues its close. Close rejections are swallowed. Every state update checks a per-effect `cancelled` flag. This also makes React StrictMode's double mount safe.
- `onMediaError`: in `video`, clear `videoPlayable`, then → `preparing/failed`; in `audio` → `unavailable`, calling `releasePreviewAudio(id)` (rejection swallowed) at once, since returning to video no longer needs the WAV; ignored otherwise. Media element errors during `audio` use the error `{ code: "preview.media_unreadable", message: "the media element failed", hintCode: null }`.
- `requestAudio`: only in `video` → `preparing/requested`.
- Preparing: resolve → `audio`; reject → `unavailable`.
- `returnToVideo`: only with `canReturn`; sets `video` with the session's URL. A later `requestAudio` waits for a pending release. The player restores position and volume and stays paused.
- A `videoPlayable` ref is set when `requestAudio` is accepted and cleared when a new session opens; `canReturn` is its value, in every path to `unavailable`.
- Preparation is started by the `onMediaError` / `requestAudio` handlers, never by an effect, and is skipped while one is running. Its result is dropped if the session id has changed.
- Export `resetPreviewQueueForTests()`; tests call it in `beforeEach`. An open that never settles keeps the state `opening`, which blocks neither editing nor Continue.
- Cues: effect on `[subtitlePath]`, independent of media, cancelled flag as above; an empty list while loading.

### D4 `SyncPlayer`

```ts
interface SyncPlayerProps { session: PreviewSession; offsetMs: number; onPosition?: (positionMs: number) => void; }
```

One `<video>` element, kept mounted whenever `lastUrl` is set (`video`, `preparing`, `audio`, and `unavailable`, where it is covered by the message), with `src` set from a `lastUrl` ref (so the picture stays until audio is ready), `preload="metadata"`, no `controls`, `autoplay` or `muted`. During `preparing` its transport is hidden and it is paused; before pausing, `resume = { time, playing, volume }` is captured. The player captures the same on any `src` change; on the next `loadedmetadata` it sets `currentTime = Math.min(resume.time, duration)`, `volume`, and calls `play()` if it was playing. A rejected `play()` leaves the control in the paused state; decoding failures arrive as `error` events.

- Position: `useState<number>` in ms from `video.currentTime * 1000`. Frame loop: `requestAnimationFrame` started on `playing`/`play`, cancelled on `pause`, `ended`, `error`, source change and unmount. `seeked`, `timeupdate` while paused and `loadedmetadata` each read the position once. An offset change re-renders through props and needs no frame.
- `error` events are ignored when the element has no `src`.
- Audio mark: shown when `status === "audio"`, or after `loadedmetadata` with `videoWidth === 0`. It is a static `aria-hidden` row of bars; no audio data.
- Transport: play/pause `<button>` without `aria-pressed`, whose accessible name changes; `<span>` time `m:ss.d / m:ss.d`, or `h:mm:ss.d` from one hour; `<input type="range" min=0 max=duration step=0.1>` with `aria-valuetext` of the time; volume `<input type="range" min=0 max=1 step=0.05>`; tertiary "No sound?" button only in `video`. A non-finite duration disables seek.
- Messages per state: `none`, `opening`, `preparing` (reason-specific text), `unavailable` (`ErrorNotice` plus "Back to video" when `canReturn`).
- Slip: `.sync-player__slip` with one `<span>` per active cue, `white-space: pre-line`, `--paper` background, `--ink` text, 2px `--accent` `border-inline-start`, entering with `--motion-fast`. Text nodes only. Not a live region.
- Stage: `--paper-2` under a 2px `--ink` top rule; `video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }`.

### D5 `SyncOffsetStep`

Split: `SyncOffsetView` (presentational, takes `session: PreviewSession` plus the current props) and `SyncOffsetStep`, which calls `usePreviewSession` and renders the view. New props on `SyncOffsetStep`: `mediaPath`, `subtitlePath`. The player is above `OffsetField`; `cueError` is an `ErrorNotice` between them. CSS: root `flex: 1 0 auto`, column; `.sync-player` `flex: 1 1 auto`; stage `flex: 1 1 0; min-height: 6rem`, so the stage shrinks first and the panel scrolls when content does not fit.

### D6 Harness

`?view=sync-offset&media=video|preparing|audio|none|unavailable&cue-error=1&src=<http url>` renders `SyncOffsetView` with a fixture session. `views.tsx` already has a local `function SyncOffsetView`; rename the local one to `SyncOffsetHarness`. `src` is any playable URL given by the reviewer; without it the `<video>` has no source. `scripts/preview/` is not shipped.

## Risks / Trade-offs

- [Preparing has no bound on a slow mount] → the message says so implicitly by offering continued editing; leaving the step cancels.
- [The WebView's default audio track may differ from the track the fallback picks] → accepted by the design; no track switcher.
- [A silent video cannot be detected portably] → hence the button.
- [MP4 files with a delayed track are refused in audio mode] → `preview.audio_timing_unsupported` is shown like any other preparation failure.
- [`timeupdate` granularity] → frames drive the position while playing.

## Human review and manual checks

`visual-review.md` in this change directory; not enforced by tests.
