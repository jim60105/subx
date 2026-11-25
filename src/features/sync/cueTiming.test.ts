import { describe, expect, it } from "vitest";

import type { PreviewCueDto } from "../../types/ipc";
import { activeCues, shiftMs } from "./cueTiming";

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
  it("shows a cue from its shifted start to just before its shifted end", () => {
    const cues = [cue(5_000, 7_000)];

    expect(shownAt(cues, 6_000, 1_000)).toEqual(["5000"]);
    expect(shownAt(cues, 7_999, 1_000)).toEqual(["5000"]);
    expect(shownAt(cues, 5_999, 1_000)).toEqual([]);
    expect(shownAt(cues, 8_000, 1_000)).toEqual([]);
  });

  it("clamps a negative shift at zero", () => {
    const cues = [cue(500, 1_500)];

    expect(shownAt(cues, 0, -1_000)).toEqual(["500"]);
    expect(shownAt(cues, 499, -1_000)).toEqual(["500"]);
    expect(shownAt(cues, 500, -1_000)).toEqual([]);
  });

  it("never shows a cue clamped to zero length", () => {
    const cues = [cue(200, 800)];

    for (const position of [0, 1, 200, 799, 800]) {
      expect(shownAt(cues, position, -1_000)).toEqual([]);
    }
  });

  it("shows overlapping cues together in file order", () => {
    // The later cue in the file starts first.
    const cues = [cue(2_000, 5_000, "first in file"), cue(1_000, 4_000, "second in file")];

    expect(shownAt(cues, 3_000, 0)).toEqual(["first in file", "second in file"]);
  });
});
