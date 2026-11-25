import type { PreviewCueDto } from "../../types/ipc";

/**
 * One cue time moved by the offset, clamped at zero.
 *
 * The same rule `shift_subtitle` applies when the subtitle is saved: a
 * negative offset never pushes a time below the start of the media.
 */
export function shiftMs(timeMs: number, offsetMs: number): number {
  return Math.max(0, timeMs + offsetMs);
}

/**
 * The cues shown at `positionMs` once every cue is shifted by `offsetMs`.
 *
 * A cue is shown from its shifted start up to, but not including, its shifted
 * end, so a cue clamped to zero length is never shown. Overlapping cues are all
 * returned, in file order.
 */
export function activeCues(
  cues: readonly PreviewCueDto[],
  positionMs: number,
  offsetMs: number,
): PreviewCueDto[] {
  return cues.filter(
    (cue) => shiftMs(cue.startMs, offsetMs) <= positionMs && positionMs < shiftMs(cue.endMs, offsetMs),
  );
}
