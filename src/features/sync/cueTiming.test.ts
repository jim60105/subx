import { describe, expect, it } from "vitest";

import type { PreviewCueDto } from "../../types/ipc";
import { activeCues, shiftMs, visibleCues } from "./cueTiming";

function cue(startMs: number, endMs: number, text = `${startMs}`): PreviewCueDto {
  return { startMs, endMs, text };
}

function shownAt(cues: PreviewCueDto[], positionMs: number, offsetMs: number): string[] {
  return activeCues(cues, positionMs, offsetMs).map((entry) => entry.text);
}

describe("shiftMs", () => {
  it("adds the offset and clamps at zero", () => {
    expect(shiftMs(5_000, 1_000)).toBe(6_000);
    expect(shiftMs(500, -1_000)).toBe(0);
    expect(shiftMs(0, 0)).toBe(0);
  });
});

describe("activeCues", () => {
  // @covers sync-workflow/preview-timing-matches-the-applied-shift#cue-is-active-from-start-to-before-end
  it("shows a cue from its shifted start to just before its shifted end", () => {
    const cues = [cue(5_000, 7_000)];

    expect(shownAt(cues, 6_000, 1_000)).toEqual(["5000"]);
    expect(shownAt(cues, 7_999, 1_000)).toEqual(["5000"]);
    expect(shownAt(cues, 5_999, 1_000)).toEqual([]);
    expect(shownAt(cues, 8_000, 1_000)).toEqual([]);
  });

  // @covers sync-workflow/preview-timing-matches-the-applied-shift#negative-shift-clamps-at-zero
  it("clamps a negative shift at zero", () => {
    const cues = [cue(500, 1_500)];

    expect(shownAt(cues, 0, -1_000)).toEqual(["500"]);
    expect(shownAt(cues, 499, -1_000)).toEqual(["500"]);
    expect(shownAt(cues, 500, -1_000)).toEqual([]);
  });

  // @covers sync-workflow/preview-timing-matches-the-applied-shift#cue-clamped-to-zero-length-is-not-shown
  it("never shows a cue clamped to zero length", () => {
    const cues = [cue(200, 800)];

    for (const position of [0, 1, 200, 799, 800]) {
      expect(shownAt(cues, position, -1_000)).toEqual([]);
    }
  });

  // @covers sync-workflow/preview-timing-matches-the-applied-shift#overlapping-cues-keep-file-order
  it("shows overlapping cues together in file order", () => {
    // The later cue in the file starts first.
    const cues = [cue(2_000, 5_000, "first in file"), cue(1_000, 4_000, "second in file")];

    expect(shownAt(cues, 3_000, 0)).toEqual(["first in file", "second in file"]);
  });
});

describe("visibleCues", () => {
  const indices = (cues: PreviewCueDto[], positionMs: number, offsetMs: number, half: number) =>
    visibleCues(cues, positionMs, offsetMs, half).map((entry) => entry.index);

  it("includes cues that touch either edge of the window and nothing beyond", () => {
    // Window [9_000, 11_000].
    const cues = [
      cue(8_000, 8_999),
      cue(8_000, 9_000),
      cue(11_000, 12_000),
      cue(11_001, 12_000),
    ];

    expect(indices(cues, 10_000, 0, 1_000)).toEqual([1, 2]);
  });

  it("includes a cue visible only by its shifted interval, with both intervals", () => {
    const cues = [cue(1_000, 2_000)];

    const [entry] = visibleCues(cues, 30_000, 28_500, 1_000);
    expect(entry).toEqual({
      index: 0,
      startMs: 1_000,
      endMs: 2_000,
      shiftedStartMs: 29_500,
      shiftedEndMs: 30_500,
      active: true,
    });
    expect(indices(cues, 30_000, 0, 1_000)).toEqual([]);
  });

  it("clamps the shifted interval and never marks a zero-length cue active", () => {
    const [entry] = visibleCues([cue(200, 800)], 0, -1_000, 5_000);

    expect(entry.shiftedStartMs).toBe(0);
    expect(entry.shiftedEndMs).toBe(0);
    expect(entry.active).toBe(false);
  });

  it("returns only the cues in the window of a long subtitle, in file order", () => {
    // 2000 one-second cues, one every two seconds.
    const cues = Array.from({ length: 2_000 }, (_, i) => cue(i * 2_000, i * 2_000 + 1_000));

    const visible = indices(cues, 2_000_000, 0, 10_000);
    // [1_990_000, 2_010_000]: cues 995 through 1005.
    expect(visible).toEqual(Array.from({ length: 11 }, (_, i) => 995 + i));
    expect(visibleCues(cues, 2_000_000, 0, 10_000).filter((entry) => entry.active)).toEqual([
      expect.objectContaining({ index: 1_000 }),
    ]);
  });
});
