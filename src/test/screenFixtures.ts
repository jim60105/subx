/**
 * Fixture data for rendering every screen with representative content: shared
 * by the hard-coded-string gate and the `scripts/preview/` review harness, so
 * the screens a person reviews are the screens the gate checks.
 */

import { reduceProgress, seedProgress } from "../features/translate/progressReducer";
import type { RunProgress } from "../features/translate/progressReducer";
import type {
  ConfigDto,
  ConvertPlanDto,
  ExecutionReportDto,
  MatchPlanDto,
  SyncDefaultsDto,
  TranslatePlanDto,
  TranslateProgress,
  TranslateScanResult,
  TranslationReportDto,
  VersionInfoDto,
} from "../types/ipc";

export const CONFIG: ConfigDto = {
  ai: {
    provider: "openai",
    model: "gpt-4.1-mini",
    baseUrl: "https://api.openai.com/v1",
    apiKeyMasked: "****1234",
    apiKeySet: true,
  },
};

export const BUILD_INFO: VersionInfoDto = {
  version: "0.2.0",
  gitHash: "abc1234",
  debug: true,
};

/**
 * A small populated plan makes the language-bar and ledger translations reach
 * the DOM. Names are digits so no fixture text reads as prose.
 */
export const REVIEW_PLAN: MatchPlanDto = {
  planId: "plan-1",
  relocationMode: "rename",
  videos: [
    {
      videoName: "1",
      matches: [
        {
          id: 0,
          subtitleName: "1",
          targetPath: "/1",
          confidence: 90,
          language: "tc",
          reasoning: [],
        },
        {
          id: 1,
          subtitleName: "2",
          targetPath: "/2",
          confidence: 90,
          language: "en",
          reasoning: [],
        },
        {
          id: 2,
          subtitleName: "3",
          targetPath: "/3",
          confidence: 90,
          language: null,
          reasoning: [],
        },
        // Below the review threshold, so the meter, the figure, and the
        // expanded reasoning reach the DOM. No language, so the per-language
        // counts above stay as they are.
        {
          id: 3,
          subtitleName: "4",
          targetPath: "/4",
          confidence: 52,
          language: null,
          reasoning: ["1"],
        },
      ],
    },
  ],
  unmatchedVideos: ["5"],
  unmatchedSubtitles: ["6"],
};

/**
 * The convert equivalent: one runnable item, so its diff lines reach the DOM.
 * The name is key-shaped and the paths sit under `/fixtures/`, so neither
 * reads as prose.
 */
export const CONVERT_PLAN: ConvertPlanDto = {
  planId: "convert-1",
  targetFormat: "vtt",
  keepOriginal: true,
  items: [
    {
      id: 0,
      inputName: "ep01.srt",
      inputPath: "/fixtures/a/ep01.srt",
      outputPath: "/fixtures/a/ep01.vtt",
      outputExists: false,
      skipReason: null,
    },
  ],
};

/** The sync steps' seed values; all three are numbers, never prose. */
export const SYNC_DEFAULTS: SyncDefaultsDto = {
  defaultMethod: "auto",
  vadSensitivity: 0.5,
  maxOffsetMs: 60_000,
};

/** The translate equivalent: one runnable item, under the same rules. */
export const TRANSLATE_PLAN: TranslatePlanDto = {
  planId: "translate-1",
  targetLanguage: "zh-TW",
  outputMode: "suffix",
  items: [
    {
      id: 0,
      inputName: "ep01.srt",
      inputPath: "/fixtures/a/ep01.srt",
      outputPath: "/fixtures/a/ep01.zh-TW.srt",
      cueCount: 12,
      outputExists: false,
      skipReason: null,
    },
  ],
};

/*
 * The report fixtures carry one outcome each. Since the wizards took over the
 * navigation buttons these panels are outcome lists and nothing else, so an
 * empty report renders only its heading — too little for the "did this screen
 * actually render?" floor below to mean anything.
 */
/**
 * A translate scan across a directly added file, a folder and an archive, with
 * one unparsable file, so every kind of ledger group and row reaches the DOM.
 * Paths sit under `/fixtures/` and names are key-shaped, as above.
 */
export const TRANSLATE_SOURCES = ["/fixtures/a/ep01.srt", "/fixtures/b/", "/fixtures/c.zip"];

export const TRANSLATE_SCAN: TranslateScanResult = {
  files: [
    { name: "ep01.srt", source: "/fixtures/a/ep01.srt", cueCount: 378, unparsable: false },
    { name: "ep02.srt", source: "/fixtures/b/", cueCount: 372, unparsable: false },
    { name: "ep02b.srt", source: "/fixtures/b/", cueCount: 0, unparsable: true },
    { name: "ep03.ass", source: "/fixtures/c.zip", cueCount: 412, unparsable: false },
  ],
  defaultTargetLanguage: "zh-TW",
};

export const TRANSLATE_REPORT: TranslationReportDto = {
  outcomes: [
    {
      inputName: "ep01.srt",
      outputPath: "/tmp/ep01.zh-TW.srt",
      status: "translated",
      backupPath: null,
      error: null,
      warning: null,
    },
  ],
  successCount: 1,
  failureCount: 0,
  cancelled: false,
};

export const EXECUTION_REPORT: ExecutionReportDto = {
  outcomes: [{ subtitleName: "ep01.srt", targetPath: "/tmp/ep01.srt", applied: true, error: null }],
  successCount: 1,
  failureCount: 0,
};

/** The one-operation plan `EXECUTION_REPORT` reports on, so the execute step maps its outcome. */
export const EXECUTION_PLAN: MatchPlanDto = {
  planId: "plan-execute",
  relocationMode: "rename",
  videos: [
    {
      videoName: "ep01.mkv",
      matches: [
        { id: 0, subtitleName: "ep01.srt", targetPath: "/tmp/ep01.srt", confidence: 90, language: null, reasoning: [] },
      ],
    },
  ],
  unmatchedVideos: [],
  unmatchedSubtitles: [],
};

/**
 * A translate run with one finished file, one mid-batch with a resend and two
 * batches returned, and one waiting, reduced from snapshots by the real
 * reducer so every row state and the estimate reach the DOM.
 */
export const TRANSLATE_RUN_PROGRESS: RunProgress = (() => {
  const items = [
    { id: 0, inputName: "ep01.srt", cueCount: 80 },
    { id: 1, inputName: "ep02.srt", cueCount: 120 },
    { id: 2, inputName: "ep03.srt", cueCount: 90 },
  ];
  const base = (id: number, extra: Partial<TranslateProgress>): TranslateProgress => ({
    stage: "translating",
    index: id + 1,
    total: items.length,
    fileName: items[id].inputName,
    itemId: id,
    processedCues: 0,
    totalCues: items[id].cueCount,
    batchSize: 40,
    batchTotal: Math.ceil(items[id].cueCount / 40),
    batchesDone: 0,
    batchInFlight: 0,
    resend: false,
    outcome: null,
    ...extra,
  });
  const events: Array<[TranslateProgress, number]> = [
    [base(0, { stage: "terminology" }), 0],
    [base(0, { batchInFlight: 1 }), 1000],
    [base(0, { batchesDone: 1, processedCues: 40 }), 4000],
    [base(0, { batchInFlight: 2, batchesDone: 1, processedCues: 40 }), 4000],
    [base(0, { batchesDone: 2, processedCues: 80 }), 8000],
    [base(0, { stage: "fileDone", batchesDone: 2, processedCues: 80, outcome: "translated" }), 9000],
    [base(1, { stage: "terminology" }), 9000],
    [base(1, { batchInFlight: 1 }), 10000],
    [base(1, { batchesDone: 1, processedCues: 40 }), 14000],
    [base(1, { batchInFlight: 2, batchesDone: 1, processedCues: 40 }), 14000],
    [base(1, { batchInFlight: 2, batchesDone: 1, processedCues: 40, resend: true }), 16000],
  ];
  return events.reduce((state, [event, at]) => reduceProgress(state, event, at), seedProgress(items, 0));
})();
