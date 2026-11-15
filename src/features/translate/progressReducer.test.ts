import { describe, expect, it } from "vitest";

import type { TranslateProgress } from "../../types/ipc";
import { estimateRemaining, reduceProgress, seedProgress } from "./progressReducer";
import type { RunProgress } from "./progressReducer";

const ITEMS = [
  { id: 3, inputName: "a.srt", cueCount: 378 },
  { id: 7, inputName: "b.srt", cueCount: 400 },
];

function snapshot(overrides: Partial<TranslateProgress>): TranslateProgress {
  return {
    stage: "translating",
    index: 1,
    total: 2,
    fileName: "a.srt",
    itemId: 3,
    processedCues: 0,
    totalCues: 378,
    batchSize: 40,
    batchTotal: 10,
    batchesDone: 0,
    batchInFlight: 0,
    resend: false,
    outcome: null,
    ...overrides,
  };
}

/** Applies `[event, at]` pairs in order. */
function run(events: Array<[Partial<TranslateProgress>, number]>, state = seedProgress(ITEMS, 0)): RunProgress {
  return events.reduce((current, [event, at]) => reduceProgress(current, snapshot(event), at), state);
}

describe("reduceProgress", () => {
  it("seeds every selected file as waiting, in plan order, with its cue count", () => {
    const state = seedProgress(ITEMS, 5);

    expect(state.order).toEqual([3, 7]);
    expect(state.rows[3]).toMatchObject({ status: "waiting", totalCues: 378, name: "a.srt", stage: null });
    expect(state.rows[7]).toMatchObject({ status: "waiting", totalCues: 400 });
    expect(state).toMatchObject({ batchSize: null, estimateMs: null, startedAt: 5, finished: false });
  });

  it("moves a file from waiting to active to done", () => {
    let state = run([[{ stage: "terminology" }, 1]]);
    expect(state.rows[3]).toMatchObject({ status: "active", stage: "terminology", startedAt: 1 });
    expect(state.rows[7].status).toBe("waiting");
    expect(state.batchSize).toBe(40);
    expect(state.current).toEqual({ itemId: 3, index: 1, total: 2, fileName: "a.srt" });

    state = run([[{ stage: "fileDone", outcome: "translated", processedCues: 378, batchesDone: 10 }, 9]], state);
    expect(state.rows[3]).toMatchObject({ status: "done", outcome: "translated", startedAt: 1, finishedAt: 9 });
  });

  it("records each completion's outcome, cancelled included", () => {
    const state = run([
      [{ stage: "terminology" }, 1],
      [{ stage: "fileDone", outcome: "failed" }, 2],
      [{ stage: "fileDone", outcome: "cancelled", itemId: 7, index: 2, fileName: "b.srt" }, 3],
    ]);

    expect(state.rows[3]).toMatchObject({ status: "done", outcome: "failed" });
    expect(state.rows[7]).toMatchObject({ status: "done", outcome: "cancelled", startedAt: null });
  });

  it("ignores a snapshot for an item that was not seeded", () => {
    const before = seedProgress(ITEMS, 0);
    const after = reduceProgress(before, snapshot({ stage: "fileDone", itemId: 99, outcome: "skipped" }), 1);

    expect(after).toBe(before);
  });

  it("takes the engine's batch count and clamps the returned batches to it", () => {
    const state = run([
      [{ stage: "terminology", batchTotal: 10 }, 1],
      [{ batchTotal: 9, batchInFlight: 1 }, 2],
      [{ batchTotal: 9, batchesDone: 12 }, 3],
    ]);

    expect(state.rows[3]).toMatchObject({ batchTotal: 9, batchesDone: 9 });
  });

  it("times a batch from its first send, through a resend, to its return", () => {
    const state = run([
      [{ stage: "terminology" }, 0],
      [{ batchInFlight: 1 }, 1000],
      [{ batchInFlight: 1, resend: true }, 3000],
      [{ batchesDone: 1 }, 6000],
      [{ batchInFlight: 2, batchesDone: 1 }, 6000],
      [{ batchesDone: 2 }, 8000],
    ]);

    expect(state.batchDurations).toEqual([5000, 2000]);
  });

  it("withholds the estimate until two batches returned, then covers the waiting files", () => {
    let state = run([
      [{ stage: "terminology" }, 0],
      [{ batchInFlight: 1 }, 0],
      [{ batchesDone: 1 }, 4000],
      [{ batchInFlight: 2, batchesDone: 1 }, 4000],
    ]);
    expect(state.estimateMs).toBeNull();

    state = run([[{ batchesDone: 2 }, 8000]], state);
    // Two 4 s batches; 8 left in the active file and 10 for the waiting one.
    expect(state.estimateMs).toBe(72_000);
    expect(estimateRemaining(state)).toBe(72_000);
  });

  it("recomputes the estimate only when a batch returns", () => {
    let state = run([
      [{ stage: "terminology" }, 0],
      [{ batchInFlight: 1 }, 0],
      [{ batchesDone: 1 }, 4000],
      [{ batchInFlight: 2, batchesDone: 1 }, 4000],
      [{ batchesDone: 2 }, 8000],
    ]);
    const estimate = state.estimateMs;

    state = run([[{ batchInFlight: 3, batchesDone: 2 }, 9000], [{ stage: "fileDone", outcome: "failed", batchesDone: 2 }, 9500]], state);

    expect(state.estimateMs).toBe(estimate);
  });

  it("counts no batches for a waiting file while the batch size is unknown", () => {
    const state = seedProgress(ITEMS, 0);

    expect(estimateRemaining({ ...state, batchDurations: [1, 1] })).toBe(0);
  });

  it("leaves every row intact when the run finishes", () => {
    const before = run([[{ stage: "terminology" }, 1]]);
    const after = reduceProgress(before, snapshot({ stage: "finished", itemId: 0, fileName: "" }), 2);

    expect(after.finished).toBe(true);
    expect(after.rows).toBe(before.rows);
    expect(after.current).toBe(before.current);
  });
});
