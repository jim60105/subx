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

/** How many pixels one second of media takes on the time rule. */
export const RULE_PX_PER_SECOND = 78;

/** A cue the time rule draws: its original and shifted intervals. */
export interface RuleCue {
  /** The cue's place in the file, stable across renders. */
  index: number;
  startMs: number;
  endMs: number;
  shiftedStartMs: number;
  shiftedEndMs: number;
  /** Whether the cue is shown at the position, by the rule of `activeCues`. */
  active: boolean;
}

/**
 * The cues the time rule draws around `positionMs`.
 *
 * A cue is included when its original or its shifted interval meets the
 * window `[positionMs - halfWindowMs, positionMs + halfWindowMs]`, edges
 * included, so a bar is never missing at either end of the rule. The list is
 * scanned once, in file order.
 */
export function visibleCues(
  cues: readonly PreviewCueDto[],
  positionMs: number,
  offsetMs: number,
  halfWindowMs: number,
): RuleCue[] {
  const lo = positionMs - halfWindowMs;
  const hi = positionMs + halfWindowMs;
  const visible: RuleCue[] = [];
  cues.forEach((cue, index) => {
    const shiftedStartMs = shiftMs(cue.startMs, offsetMs);
    const shiftedEndMs = shiftMs(cue.endMs, offsetMs);
    const original = cue.startMs <= hi && cue.endMs >= lo;
    const shifted = shiftedStartMs <= hi && shiftedEndMs >= lo;
    if (!original && !shifted) return;
    visible.push({
      index,
      startMs: cue.startMs,
      endMs: cue.endMs,
      shiftedStartMs,
      shiftedEndMs,
      active: shiftedStartMs <= positionMs && positionMs < shiftedEndMs,
    });
  });
  return visible;
}
