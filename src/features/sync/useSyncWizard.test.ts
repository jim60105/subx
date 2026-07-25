import { describe, expect, it } from "vitest";

import { defaultOutputPath } from "./useSyncWizard";

/**
 * The frontend's copy of the crate's `create_default_output_path`.
 *
 * It is display-only — the backend recomputes the path with the crate's own
 * function when none is sent — but a drift still shows the user a path their
 * file will not be written to, so the rules are pinned here rather than left to
 * the wizard tests, which only ever exercise one shape.
 */
describe("the proposed output path", () => {
  it("inserts _synced before the extension", () => {
    expect(defaultOutputPath("/media/movie.srt")).toBe("/media/movie_synced.srt");
  });

  it("keeps the extension it found, whatever it is", () => {
    expect(defaultOutputPath("/media/movie.vtt")).toBe("/media/movie_synced.vtt");
    expect(defaultOutputPath("/media/movie.ASS")).toBe("/media/movie_synced.ASS");
  });

  it("splits on the last dot, so a dotted stem survives", () => {
    expect(defaultOutputPath("/media/show.s01e01.srt")).toBe("/media/show.s01e01_synced.srt");
  });

  it("handles Windows separators", () => {
    expect(defaultOutputPath("C:\\media\\movie.srt")).toBe("C:\\media\\movie_synced.srt");
  });

  it("handles a bare file name with no directory", () => {
    expect(defaultOutputPath("movie.srt")).toBe("movie_synced.srt");
  });

  /// Both of these match the crate: with no extension there is no `_synced`
  /// name to build, so the input comes back unchanged — and the backend refuses
  /// that rather than writing over the subtitle being synced.
  it("returns an extensionless path unchanged", () => {
    expect(defaultOutputPath("/media/movie")).toBe("/media/movie");
  });

  it("treats a leading dot as a hidden name, not an extension", () => {
    expect(defaultOutputPath("/media/.srt")).toBe("/media/.srt");
  });
});
