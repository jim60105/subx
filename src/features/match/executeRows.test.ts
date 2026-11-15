import { describe, expect, it } from "vitest";

import type { ExecutionOutcomeDto, MatchOperationDto, MatchPlanDto } from "../../types/ipc";
import { buildExecuteRows } from "./executeRows";

function operation(id: number, name: string): MatchOperationDto {
  return { id, subtitleName: name, targetPath: `/media/out/${name}.renamed.srt`, confidence: 90, language: null, reasoning: [] };
}

// Plan order deliberately differs from id order: video B's operation 5 comes
// before video A's operation 2.
const PLAN: MatchPlanDto = {
  planId: "plan",
  relocationMode: "rename",
  videos: [
    { videoName: "b.mkv", matches: [operation(5, "b.srt"), operation(1, "b2.srt")] },
    { videoName: "a.mkv", matches: [operation(2, "a.srt")] },
  ],
  unmatchedVideos: [],
  unmatchedSubtitles: [],
};

function outcome(name: string, applied = true): ExecutionOutcomeDto {
  return {
    subtitleName: name,
    targetPath: `/media/out/${name}.renamed.srt`,
    applied,
    error: applied ? null : { code: "core.file_not_found", message: "gone", hintCode: null },
  };
}

describe("buildExecuteRows", () => {
  it("lists only the selected operations, in plan order, before a report", () => {
    const rows = buildExecuteRows(PLAN, new Set([2, 5]), null);

    expect(rows.map((row) => row.oldName)).toEqual(["b.srt", "a.srt"]);
    expect(rows.every((row) => row.outcome === null)).toBe(true);
    expect(rows.map((row) => row.key)).toEqual(["op-5", "op-2"]);
  });

  it("names the result by the base name of its target path", () => {
    const [row] = buildExecuteRows(PLAN, new Set([2]), null);
    expect(row.newName).toBe("a.srt.renamed.srt");
  });

  it("maps outcomes in ascending operation-id order back onto plan-order rows", () => {
    const report = { outcomes: [outcome("a.srt"), outcome("b.srt", false)], successCount: 1, failureCount: 1 };
    const rows = buildExecuteRows(PLAN, new Set([5, 2]), report);

    expect(rows.map((row) => row.oldName)).toEqual(["b.srt", "a.srt"]);
    expect(rows[0].outcome).toBe(report.outcomes[1]);
    expect(rows[1].outcome).toBe(report.outcomes[0]);
  });

  it("ignores a selected id the plan does not hold, as the backend does", () => {
    const report = { outcomes: [outcome("a.srt")], successCount: 1, failureCount: 0 };
    const rows = buildExecuteRows(PLAN, new Set([2, 99]), report);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ key: "op-2", outcome: report.outcomes[0] });
  });

  it("falls back to report order when the report length differs from the selection", () => {
    const report = { outcomes: [outcome("a.srt")], successCount: 1, failureCount: 0 };
    const rows = buildExecuteRows(PLAN, new Set([2, 5]), report);

    expect(rows).toEqual([
      { key: "outcome-0", oldName: "a.srt", newName: "a.srt.renamed.srt", outcome: report.outcomes[0] },
    ]);
  });

  it("falls back to report order when a mapped name does not match its operation", () => {
    // Descending order from the backend would mis-attribute; the name check catches it.
    const report = { outcomes: [outcome("b.srt"), outcome("a.srt")], successCount: 2, failureCount: 0 };
    const rows = buildExecuteRows(PLAN, new Set([2, 5]), report);

    expect(rows.map((row) => [row.key, row.oldName, row.outcome])).toEqual([
      ["outcome-0", "b.srt", report.outcomes[0]],
      ["outcome-1", "a.srt", report.outcomes[1]],
    ]);
  });
});
