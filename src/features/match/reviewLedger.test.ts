import { describe, expect, it } from "vitest";

import type { MatchOperationDto, MatchPlanDto } from "../../types/ipc";
import { buildLedger, filterLedger, ledgerCounts, meterSegments } from "./reviewLedger";
import type { LedgerRow } from "./reviewLedger";

function op(id: number, confidence: number): MatchOperationDto {
  return {
    id,
    subtitleName: `sub-${id}.srt`,
    targetPath: `/m/sub-${id}.srt`,
    confidence,
    language: null,
    reasoning: [],
  };
}

function plan(videos: MatchOperationDto[][], unmatchedVideos: string[] = [], unmatchedSubtitles: string[] = []): MatchPlanDto {
  return {
    planId: "plan",
    relocationMode: "rename",
    videos: videos.map((matches, index) => ({ videoName: `video-${index}.mkv`, matches })),
    unmatchedVideos,
    unmatchedSubtitles,
  };
}

function pairs(rows: LedgerRow[]) {
  return rows.flatMap((row) => (row.kind === "pair" ? [row] : []));
}

describe("buildLedger", () => {
  it("keeps plan order regardless of confidence", () => {
    const rows = buildLedger(plan([[op(0, 96)], [op(1, 52)], [op(2, 98)]]));

    expect(pairs(rows).map((row) => row.operation.confidence)).toEqual([96, 52, 98]);
  });

  it("marks a pairing low strictly below 80", () => {
    const rows = pairs(buildLedger(plan([[op(0, 79), op(1, 80)]])));

    expect(rows.map((row) => row.low)).toEqual([true, false]);
  });

  it("names a video on its first pairing only", () => {
    const rows = pairs(buildLedger(plan([[op(0, 90), op(1, 90)], [op(2, 90)]])));

    expect(rows.map((row) => row.showVideoName)).toEqual([true, false, true]);
  });

  it("lists unmatched videos, then unmatched subtitles, after every pairing", () => {
    const rows = buildLedger(plan([[op(0, 90)]], ["lonely.mkv"], ["orphan.srt"]));

    expect(rows.map((row) => row.key)).toEqual(["pair-0", "video-0", "subtitle-0"]);
  });
});

describe("filterLedger", () => {
  it("names the video of a low second pairing shown on its own", () => {
    const rows = buildLedger(plan([[op(0, 95), op(1, 52)], [op(2, 95)]]));

    const kept = filterLedger(rows, "needsReview");

    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ kind: "pair", showVideoName: true });
    expect(pairs(kept)[0].operation.id).toBe(1);
  });

  it("keeps consecutive low pairings of one video under one name", () => {
    const rows = buildLedger(plan([[op(0, 50), op(1, 95), op(2, 60)]]));

    expect(pairs(filterLedger(rows, "needsReview")).map((row) => row.showVideoName)).toEqual([true, false]);
  });

  it("keeps only unmatched rows for the unmatched filter", () => {
    const rows = buildLedger(plan([[op(0, 50)]], ["lonely.mkv"], ["orphan.srt"]));

    expect(filterLedger(rows, "unmatched").map((row) => row.kind)).toEqual(["unmatchedVideo", "unmatchedSubtitle"]);
  });

  it("keeps everything for the all filter", () => {
    const rows = buildLedger(plan([[op(0, 50)]], ["lonely.mkv"]));

    expect(filterLedger(rows, "all")).toEqual(rows);
  });
});

describe("ledgerCounts", () => {
  it("counts pairings, low pairings, and unmatched entries of the whole plan", () => {
    const rows = buildLedger(plan([[op(0, 90), op(1, 40)], [op(2, 90)]], ["lonely.mkv"], ["orphan.srt"]));

    expect(ledgerCounts(rows)).toEqual({ all: 3, needsReview: 1, unmatched: 2 });
  });
});

describe("meterSegments", () => {
  it("fills one segment per 20 points, clamped to the meter", () => {
    expect([0, 52, 100].map(meterSegments)).toEqual([0, 3, 5]);
    expect([-10, 140].map(meterSegments)).toEqual([0, 5]);
  });
});
