/**
 * Fixture data for rendering every screen with representative content: shared
 * by the hard-coded-string gate and the `scripts/preview/` review harness, so
 * the screens a person reviews are the screens the gate checks.
 */

import type {
  ConfigDto,
  ConvertPlanDto,
  ExecutionReportDto,
  MatchPlanDto,
  SyncDefaultsDto,
  TranslatePlanDto,
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

/** The convert equivalent: chrome only, no file names to read as prose. */
export const EMPTY_CONVERT_PLAN: ConvertPlanDto = {
  planId: "convert-1",
  targetFormat: "srt",
  keepOriginal: true,
  items: [],
};

/** The sync steps' seed values; all three are numbers, never prose. */
export const SYNC_DEFAULTS: SyncDefaultsDto = {
  defaultMethod: "auto",
  vadSensitivity: 0.5,
  maxOffsetMs: 60_000,
};

/** The translate equivalent: chrome only, no file names to read as prose. */
export const EMPTY_TRANSLATE_PLAN: TranslatePlanDto = {
  planId: "translate-1",
  targetLanguage: "zh-TW",
  outputMode: "suffix",
  items: [],
};

/*
 * The report fixtures carry one outcome each. Since the wizards took over the
 * navigation buttons these panels are outcome lists and nothing else, so an
 * empty report renders only its heading — too little for the "did this screen
 * actually render?" floor below to mean anything.
 */
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
