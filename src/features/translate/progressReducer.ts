import type { TranslateProgress, TranslateStage, TranslationStatusDto } from "../../types/ipc";

export type RowStatus = "waiting" | "active" | "done";

/** One selected file's place in the run. */
export interface ProgressRow {
  itemId: number;
  name: string;
  status: RowStatus;
  /** The last reported phase; `null` until the file starts. */
  stage: TranslateStage | null;
  totalCues: number;
  processedCues: number;
  batchTotal: number;
  batchesDone: number;
  /** 1-based batch in flight, `0` when none is. */
  batchInFlight: number;
  resend: boolean;
  startedAt: number | null;
  finishedAt: number | null;
  outcome: TranslationStatusDto | null;
}

/** Where the status line points: the file the latest snapshot named. */
export interface CurrentFile {
  itemId: number;
  index: number;
  total: number;
  fileName: string;
}

export interface RunProgress {
  /** Selected item IDs in plan order. */
  order: number[];
  rows: Record<number, ProgressRow>;
  /**
   * The configured batch size, known from the first snapshot on: the wizard
   * reads no configuration, so rows are seeded without it.
   */
  batchSize: number | null;
  /** Durations of returned initial-pass batches, in milliseconds. */
  batchDurations: number[];
  /** When the batch in flight was first sent; a resend does not restart it. */
  lastBatchStartedAt: number | null;
  /** Milliseconds left, recomputed only when a batch returns; `null` until two have. */
  estimateMs: number | null;
  current: CurrentFile | null;
  startedAt: number;
  finished: boolean;
}

export interface SeedItem {
  id: number;
  inputName: string;
  cueCount: number;
}

/** The run before any event: every selected file waiting, in plan order. */
export function seedProgress(items: readonly SeedItem[], now: number): RunProgress {
  const rows: Record<number, ProgressRow> = {};
  for (const item of items) {
    rows[item.id] = {
      itemId: item.id,
      name: item.inputName,
      status: "waiting",
      stage: null,
      totalCues: item.cueCount,
      processedCues: 0,
      batchTotal: 0,
      batchesDone: 0,
      batchInFlight: 0,
      resend: false,
      startedAt: null,
      finishedAt: null,
      outcome: null,
    };
  }
  return {
    order: items.map((item) => item.id),
    rows,
    batchSize: null,
    batchDurations: [],
    lastBatchStartedAt: null,
    estimateMs: null,
    current: null,
    startedAt: now,
    finished: false,
  };
}

/** Batches a waiting file will need, or 0 while the batch size is unknown. */
function batchesFor(cues: number, batchSize: number | null): number {
  return batchSize === null || batchSize <= 0 ? 0 : Math.ceil(cues / batchSize);
}

/**
 * Mean returned-batch duration times the initial batches left across every
 * selected file (design D7). Fill-in, terminology and writing are not
 * estimated, so this is a floor.
 */
export function estimateRemaining(state: RunProgress): number | null {
  if (state.batchDurations.length < 2) return null;
  const mean = state.batchDurations.reduce((sum, value) => sum + value, 0) / state.batchDurations.length;
  let remaining = 0;
  for (const id of state.order) {
    const row = state.rows[id];
    if (row.status === "active") remaining += Math.max(0, row.batchTotal - row.batchesDone);
    else if (row.status === "waiting") remaining += batchesFor(row.totalCues, state.batchSize);
  }
  return mean * remaining;
}

/**
 * Folds one progress snapshot into the run (design D7). Pure; `now` is
 * injected so tests are deterministic.
 */
export function reduceProgress(state: RunProgress, event: TranslateProgress, now: number): RunProgress {
  if (event.stage === "finished") return { ...state, finished: true };

  const previous = state.rows[event.itemId];
  // A snapshot for a file the user did not select (a skipped item) has no row.
  if (previous === undefined) return state;

  const current: CurrentFile = {
    itemId: event.itemId,
    index: event.index,
    total: event.total,
    fileName: event.fileName,
  };
  const batchSize = event.batchSize > 0 ? event.batchSize : state.batchSize;

  if (event.stage === "fileDone") {
    const row: ProgressRow = {
      ...previous,
      status: "done",
      stage: event.stage,
      processedCues: event.processedCues,
      batchInFlight: 0,
      resend: false,
      finishedAt: now,
      outcome: event.outcome,
    };
    return {
      ...state,
      rows: { ...state.rows, [event.itemId]: row },
      batchSize,
      lastBatchStartedAt: null,
      current,
    };
  }

  const batchesDone = Math.min(event.batchesDone, event.batchTotal);
  const row: ProgressRow = {
    ...previous,
    status: "active",
    stage: event.stage,
    totalCues: event.totalCues,
    processedCues: event.processedCues,
    batchTotal: event.batchTotal,
    batchesDone,
    batchInFlight: event.batchInFlight,
    resend: event.resend,
    startedAt: previous.startedAt ?? now,
  };

  let { batchDurations, lastBatchStartedAt, estimateMs } = state;
  const returned = previous.status === "active" && batchesDone > previous.batchesDone;
  if (returned && lastBatchStartedAt !== null) {
    batchDurations = [...batchDurations, now - lastBatchStartedAt];
    lastBatchStartedAt = null;
  }
  // The clock starts when a batch is first sent; the user waited for a
  // resend too, so it keeps running through one.
  if (event.batchInFlight > 0 && !event.resend) lastBatchStartedAt = now;

  const next: RunProgress = {
    ...state,
    rows: { ...state.rows, [event.itemId]: row },
    batchSize,
    batchDurations,
    lastBatchStartedAt,
    current,
  };
  if (returned) estimateMs = estimateRemaining(next);
  return { ...next, estimateMs };
}
