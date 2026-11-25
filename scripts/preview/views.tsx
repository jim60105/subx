/**
 * Every screen the review harness can show, each with the fixture props the
 * hard-coded-string gate renders it with. Later changes register their new
 * views here.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import App from "../../src/App";
import { WizardShell } from "../../src/components/WizardShell/WizardShell";
import type { WizardNavAction } from "../../src/components/WizardShell/WizardShell";
import { ConvertOptionsStep } from "../../src/features/convert/ConvertOptionsStep";
import { ConvertRunStep } from "../../src/features/convert/ConvertRunStep";
import { ConvertSourcesStep } from "../../src/features/convert/ConvertSourcesStep";
import { CONVERT_STEPS } from "../../src/features/convert/useConvertWizard";
import { AnalysisStep } from "../../src/features/match/AnalysisStep";
import { ExecuteStep } from "../../src/features/match/ExecuteStep";
import { ReviewStep } from "../../src/features/match/ReviewStep";
import { SourcesStep } from "../../src/features/match/SourcesStep";
import { WIZARD_STEPS } from "../../src/features/match/useMatchWizard";
import { AiSettingsSection } from "../../src/features/settings/AiSettingsSection";
import { ConnectionTestPanel } from "../../src/features/settings/ConnectionTestPanel";
import { PreferencesSection } from "../../src/features/settings/PreferencesSection";
import "../../src/features/settings/SettingsScreen.css";
import { formatSeconds } from "../../src/features/sync/OffsetField";
import { SyncApplyStep } from "../../src/features/sync/SyncApplyStep";
import { SyncDetectStep } from "../../src/features/sync/SyncDetectStep";
import { SyncInputsStep } from "../../src/features/sync/SyncInputsStep";
import { SyncOffsetStep, SyncOffsetView } from "../../src/features/sync/SyncOffsetStep";
import type { PreviewMedia, PreviewSession } from "../../src/features/sync/usePreviewSession";
import { SYNC_STEPS } from "../../src/features/sync/useSyncWizard";
import type { DetectPhase } from "../../src/features/sync/useSyncWizard";
import { TranslateOptionsStep } from "../../src/features/translate/TranslateOptionsStep";
import { TranslateReportStep } from "../../src/features/translate/TranslateReportStep";
import { TranslateRunStep } from "../../src/features/translate/TranslateRunStep";
import { TranslateSourcesStep } from "../../src/features/translate/TranslateSourcesStep";
import { TRANSLATE_STEPS } from "../../src/features/translate/useTranslateWizard";
import { reduceProgress, seedProgress } from "../../src/features/translate/progressReducer";
import type { RunProgress } from "../../src/features/translate/progressReducer";
import {
  CONFIG,
  CONVERT_PLAN,
  TRANSLATE_PLAN,
  EXECUTION_PLAN,
  EXECUTION_REPORT,
  REVIEW_PLAN,
  SYNC_DEFAULTS,
  TRANSLATE_REPORT,
  TRANSLATE_RUN_PROGRESS,
} from "../../src/test/screenFixtures";
import type {
  ConvertFormatDto,
  ConvertPlanDto,
  ExecutionReportDto,
  MatchOperationDto,
  MatchPlanDto,
  MatchStage,
  RelocationModeDto,
  SyncDetectionDto,
  TranslateOutputModeDto,
  TranslatePlanDto,
  TranslateProgress,
  TranslateScanResult,
} from "../../src/types/ipc";

const noop = () => {};

/**
 * 60 sources across three folders, enough to overflow any window. The first
 * name is long enough to show the entry's ellipsis.
 */
const LONG_SOURCES = ["/media/Show/Season 1/", "/media/Show/Season 2/", "/downloads/subs/"].flatMap(
  (folder, group) =>
    Array.from({ length: 20 }, (_, index) => {
      const episode = String(index + 1).padStart(2, "0");
      if (group === 0 && index === 0) return `${folder}Show.S01E01.The.Very.Long.Episode.Title.2160p.WEB-DL.DDP5.1.HDR.mkv`;
      return group === 2 ? `${folder}Show.S01E${episode}.tc.ass` : `${folder}Show.S0${group + 1}E${episode}.1080p.mkv`;
    }),
);

/**
 * Match step 1 inside the real wizard frame, so the pinned layout is visible.
 * Mode and removal are live so selection and keyboard behaviour can be judged.
 */
function MatchSourcesView({ initial }: { initial: string[] }) {
  const { t } = useTranslation("match");
  const [sources, setSources] = useState(initial);
  const [mode, setMode] = useState<RelocationModeDto>("rename");
  return (
    <WizardShell
      steps={WIZARD_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }))}
      activeStep={0}
      next={{ label: t("sources.analyze"), disabled: sources.length === 0, onClick: noop }}
    >
      <SourcesStep
        sources={sources}
        scan={sources.length === 0 ? null : { videoCount: 40, subtitleCount: 20 }}
        isScanning={false}
        scanError={undefined}
        mode={mode}
        onBrowseFiles={noop}
        onBrowseFolder={noop}
        onRemoveSources={(paths) => setSources((current) => current.filter((path) => !paths.includes(path)))}
        onModeChange={setMode}
      />
    </WizardShell>
  );
}

/**
 * 14 operations across 12 videos: two videos carry a second EN pairing, one
 * pairing sits at 52 with two reasoning lines, one at 94 with reasoning, and
 * the first video's subtitle name is long enough to show the ellipsis. Two
 * unmatched videos and one unmatched subtitle close the ledger.
 */
const REVIEW_SAMPLE_PLAN: MatchPlanDto = (() => {
  let id = 0;
  const pairing = (episode: string, language: string, extra: Partial<MatchOperationDto> = {}): MatchOperationDto => ({
    id: id++,
    subtitleName: `[Sub] Frieren ${episode}.${language}.ass`,
    targetPath: `/media/Frieren/Frieren.S01E${episode}.1080p.${language}.ass`,
    confidence: 96,
    language,
    reasoning: [],
    ...extra,
  });
  const videos = Array.from({ length: 12 }, (_, index) => {
    const episode = String(index + 1).padStart(2, "0");
    const matches = [pairing(episode, "tc")];
    if (index === 0) {
      matches[0].subtitleName = "[Sub] Frieren Beyond Journey's End 01 [WEB 1080p HEVC AAC][Traditional Chinese].tc.ass";
    }
    if (index === 3) {
      matches[0] = {
        ...matches[0],
        subtitleName: "Frieren episode final(2).tc.ass",
        confidence: 52,
        reasoning: [
          "The file name carries no episode number.",
          "The dialogue mentions the resting place of souls, which happens in episode 4.",
        ],
      };
    }
    if (index === 5) matches[0] = { ...matches[0], confidence: 94, reasoning: ["Episode number matches."] };
    if (index < 2) matches.push(pairing(episode, "en", { subtitleName: `Frieren - ${episode}.en.srt` }));
    return { videoName: `Frieren.S01E${episode}.1080p.mkv`, matches };
  });
  return {
    planId: "preview-review",
    relocationMode: "rename",
    videos,
    unmatchedVideos: ["Frieren.S01E13.1080p.mkv", "Frieren.S01E14.1080p.mkv"],
    unmatchedSubtitles: ["readme-credits.ass"],
  };
})();

/**
 * Match step 3 inside the real wizard frame, with live selection so the
 * checkboxes, the language chips, and the count beside Continue respond.
 */
function MatchReviewView() {
  const { t } = useTranslation("match");
  const ids = REVIEW_SAMPLE_PLAN.videos.flatMap((video) => video.matches.map((match) => match.id));
  const [selected, setSelected] = useState(() => new Set(ids));
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  // The same rule as `useMatchWizard`: clear a fully selected group, else fill it.
  const toggleLanguage = (group: number[]) =>
    setSelected((current) => {
      const allSelected = group.every((id) => current.has(id));
      const next = new Set(current);
      for (const id of group) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  return (
    <WizardShell
      steps={WIZARD_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }))}
      activeStep={2}
      back={{ label: t("review.back"), onClick: noop }}
      next={{
        label: t("review.execute"),
        disabled: selected.size === 0,
        onClick: noop,
        note: {
          text: `${selected.size} / ${ids.length}`,
          label: t("review.selectedCount", { count: selected.size, total: ids.length }),
        },
      }}
    >
      <ReviewStep plan={REVIEW_SAMPLE_PLAN} selectedIds={selected} onToggle={toggle} onToggleLanguage={toggleLanguage} />
    </WizardShell>
  );
}

const params = new URLSearchParams(window.location.search);

/** How long the unpinned analysis view holds each stage, in the order the backend sends them. */
const ANALYSIS_SEQUENCE: ReadonlyArray<readonly [MatchStage, number]> = [
  ["scanning", 2000],
  ["analyzing", 16000],
  ["finalizing", 3000],
];

function pinned<T extends string>(name: string, allowed: readonly T[]): T | null {
  const value = params.get(name);
  return allowed.find((entry) => entry === value) ?? null;
}

/**
 * Match step 2 inside the real wizard frame. Without `?stage=` it walks the
 * three stages and repeats, so the illustration's pacing can be judged;
 * `?stage=scanning|analyzing|finalizing` pins one.
 */
function MatchAnalysisView() {
  const { t } = useTranslation("match");
  const pin = pinned<MatchStage>("stage", ["scanning", "analyzing", "finalizing"]);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (pin !== null) return;
    const timer = window.setTimeout(
      () => setStep((current) => (current + 1) % ANALYSIS_SEQUENCE.length),
      ANALYSIS_SEQUENCE[step][1],
    );
    return () => window.clearTimeout(timer);
  }, [pin, step]);
  return (
    <WizardShell
      steps={WIZARD_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }))}
      activeStep={1}
      secondary={{ label: t("analysis.cancel"), onClick: noop }}
      next={{ label: t("analysis.running"), disabled: true }}
    >
      <AnalysisStep
        stage={pin ?? ANALYSIS_SEQUENCE[step][0]}
        error={undefined}
        scan={{ videoCount: 24, subtitleCount: 31 }}
      />
    </WizardShell>
  );
}

/** Nine operations, the sixth of which fails because its target already exists. */
const EXECUTE_SAMPLE_PLAN: MatchPlanDto = {
  planId: "preview-execute",
  relocationMode: "rename",
  videos: Array.from({ length: 9 }, (_, index) => {
    const episode = String(index + 1).padStart(2, "0");
    return {
      videoName: `Frieren.S01E${episode}.1080p.mkv`,
      matches: [
        {
          id: index,
          subtitleName: index === 3 ? "Frieren episode final(2).tc.ass" : `[Sub] Frieren ${episode}.tc.ass`,
          targetPath: `/media/Frieren/Frieren.S01E${episode}.1080p.tc.ass`,
          confidence: 96,
          language: "tc",
          reasoning: [],
        },
      ],
    };
  }),
  unmatchedVideos: [],
  unmatchedSubtitles: [],
};

const EXECUTE_SAMPLE_REPORT: ExecutionReportDto = (() => {
  const outcomes = EXECUTE_SAMPLE_PLAN.videos.map(({ matches: [operation] }) => ({
    subtitleName: operation.subtitleName,
    targetPath: operation.targetPath,
    applied: operation.id !== 5,
    error:
      operation.id === 5
        ? { code: "core.file_already_exists", message: "target exists", hintCode: null }
        : null,
  }));
  return { outcomes, successCount: 8, failureCount: 1 };
})();

type ExecutePhase = "idle" | "running" | "done";

/**
 * Match step 4 inside the real wizard frame. Without `?phase=` the primary
 * action runs idle → running (2.5 s) → done, and Finish starts over;
 * `?phase=idle|running|done` pins one phase.
 */
function MatchExecuteView() {
  const { t } = useTranslation("match");
  const pin = pinned<ExecutePhase>("phase", ["idle", "running", "done"]);
  const [phase, setPhase] = useState<ExecutePhase>(pin ?? "idle");
  useEffect(() => {
    if (pin !== null || phase !== "running") return;
    const timer = window.setTimeout(() => setPhase("done"), 2500);
    return () => window.clearTimeout(timer);
  }, [pin, phase]);
  const ids = new Set(EXECUTE_SAMPLE_PLAN.videos.map(({ matches: [operation] }) => operation.id));
  const next =
    phase === "done"
      ? { label: t("execute.report.finish"), onClick: () => pin === null && setPhase("idle") }
      : {
          label: phase === "running" ? t("execute.running") : t("execute.run"),
          disabled: phase === "running",
          onClick: () => pin === null && setPhase("running"),
        };
  return (
    <WizardShell
      steps={WIZARD_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }))}
      activeStep={3}
      back={{ label: t("execute.back"), disabled: phase !== "idle", onClick: noop }}
      next={next}
    >
      <ExecuteStep
        plan={EXECUTE_SAMPLE_PLAN}
        selectedIds={ids}
        mode="rename"
        isExecuting={phase === "running"}
        report={phase === "done" ? EXECUTE_SAMPLE_REPORT : null}
        executeError={undefined}
      />
    </WizardShell>
  );
}

/** Three sources in two folders; removal is live so the strip → large return can be judged. */
const CONVERT_SOURCES = [
  "/media/Frieren/Frieren.S01E01.1080p.tc.srt",
  "/media/Frieren/Frieren.S01E02.1080p.tc.srt",
  "/downloads/subs/Frieren.S01.ass.zip",
];

/** Convert step 1 inside the real wizard frame. */
function ConvertSourcesView() {
  const { t } = useTranslation("convert");
  const [sources, setSources] = useState(CONVERT_SOURCES);
  return (
    <WizardShell
      steps={CONVERT_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }))}
      activeStep={0}
      next={{ label: t("sources.continue"), disabled: sources.length === 0, onClick: noop }}
    >
      <ConvertSourcesStep
        sources={sources}
        scan={sources.length === 0 ? null : { subtitleCount: 26 }}
        isScanning={false}
        scanError={undefined}
        onBrowseFiles={noop}
        onBrowseFolder={noop}
        onRemoveSources={(paths) => setSources((current) => current.filter((path) => !paths.includes(path)))}
      />
    </WizardShell>
  );
}

/**
 * Four items: runnable (with a long output path), overwrite-flagged,
 * already in the target format, and colliding with another output.
 */
const CONVERT_SAMPLE_PLAN: ConvertPlanDto = {
  planId: "preview-convert",
  targetFormat: "vtt",
  keepOriginal: true,
  items: [
    {
      id: 0,
      inputName: "[Sub] Frieren Beyond Journey's End 01 [WEB 1080p HEVC AAC][Traditional Chinese].srt",
      inputPath: "/media/Frieren/[Sub] Frieren Beyond Journey's End 01 [WEB 1080p HEVC AAC][Traditional Chinese].srt",
      outputPath:
        "/media/Frieren/Season 1/Subtitles/[Sub] Frieren Beyond Journey's End 01 [WEB 1080p HEVC AAC][Traditional Chinese].vtt",
      outputExists: false,
      skipReason: null,
    },
    {
      id: 1,
      inputName: "Frieren.S01E02.tc.srt",
      inputPath: "/media/Frieren/Frieren.S01E02.tc.srt",
      outputPath: "/media/Frieren/Frieren.S01E02.tc.vtt",
      outputExists: true,
      skipReason: null,
    },
    {
      id: 2,
      inputName: "Frieren.S01E03.tc.vtt",
      inputPath: "/media/Frieren/Frieren.S01E03.tc.vtt",
      outputPath: "/media/Frieren/Frieren.S01E03.tc.vtt",
      outputExists: false,
      skipReason: "convert.already_target_format",
    },
    {
      id: 3,
      inputName: "Frieren.S01E02.tc.ass",
      inputPath: "/media/Frieren/Frieren.S01E02.tc.ass",
      outputPath: "/media/Frieren/Frieren.S01E02.tc.vtt",
      outputExists: false,
      skipReason: "convert.output_collision",
    },
  ],
};

/** Convert step 2 inside the real wizard frame; `?keep=0` starts with keep-original off. */
function ConvertOptionsView() {
  const { t } = useTranslation("convert");
  const [format, setFormat] = useState<ConvertFormatDto>("vtt");
  const [keepOriginal, setKeepOriginal] = useState(params.get("keep") !== "0");
  const [selected, setSelected] = useState(() => new Set([0, 1]));
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <WizardShell
      steps={CONVERT_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }))}
      activeStep={1}
      back={{ label: t("options.back"), onClick: noop }}
      next={{ label: t("options.continue"), disabled: selected.size === 0, onClick: noop }}
    >
      <ConvertOptionsStep
        targetFormat={format}
        keepOriginal={keepOriginal}
        plan={{ ...CONVERT_SAMPLE_PLAN, targetFormat: format, keepOriginal }}
        isPreviewing={false}
        previewError={undefined}
        selectedIds={selected}
        onFormatChange={setFormat}
        onKeepOriginalChange={setKeepOriginal}
        onToggle={toggle}
      />
    </WizardShell>
  );
}

/** Convert step 3 before starting, with two items selected; `?keep=0` turns keep-original off. */
function ConvertRunView() {
  const { t } = useTranslation("convert");
  const keepOriginal = params.get("keep") !== "0";
  return (
    <WizardShell
      steps={CONVERT_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }))}
      activeStep={2}
      next={{ label: t("run.start"), onClick: noop }}
    >
      <ConvertRunStep
        targetFormat="vtt"
        selectedCount={2}
        keepOriginal={keepOriginal}
        plan={{ ...CONVERT_SAMPLE_PLAN, keepOriginal }}
        selectedIds={new Set([0, 1])}
        isConverting={false}
        progress={null}
        report={null}
        convertError={undefined}
      />
    </WizardShell>
  );
}

/** Three items, the third excluded because its output already exists. */
function translateSamplePlan(mode: TranslateOutputModeDto): TranslatePlanDto {
  const item = (id: number, episode: string, extra: Partial<TranslatePlanDto["items"][number]> = {}) => {
    const inputPath = `/media/Frieren/Frieren.S01E${episode}.ja.srt`;
    return {
      id,
      inputName: `Frieren.S01E${episode}.ja.srt`,
      inputPath,
      outputPath: mode === "replace" ? inputPath : `/media/Frieren/Frieren.S01E${episode}.ja.zh-TW.srt`,
      cueCount: 300 + id * 17,
      outputExists: false,
      skipReason: null,
      ...extra,
    };
  };
  return {
    planId: "preview-translate",
    targetLanguage: "zh-TW",
    outputMode: mode,
    items: [
      item(0, "01"),
      item(1, "02"),
      item(2, "03", mode === "suffix" ? { outputExists: true, skipReason: "translate.output_exists" } : {}),
    ],
  };
}

/** Translate step 2 inside the real wizard frame; `?mode=replace` starts in replace mode. */
function TranslateOptionsView() {
  const { t } = useTranslation("translate");
  const [mode, setMode] = useState<TranslateOutputModeDto>(params.get("mode") === "replace" ? "replace" : "suffix");
  const [overwrite, setOverwrite] = useState(false);
  const [selected, setSelected] = useState(() => new Set([0, 1]));
  const toggle = (id: number) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  return (
    <WizardShell
      steps={TRANSLATE_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }))}
      activeStep={1}
      back={{ label: t("options.back"), onClick: noop }}
      next={{ label: t("options.continue"), disabled: selected.size === 0, onClick: noop }}
    >
      <TranslateOptionsStep
        plan={translateSamplePlan(mode)}
        isPreviewing={false}
        previewError={undefined}
        targetLanguage="zh-TW"
        sourceLanguage=""
        context=""
        glossaryText=""
        outputMode={mode}
        overwrite={overwrite}
        selectedIds={selected}
        onTargetLanguageChange={noop}
        onSourceLanguageChange={noop}
        onContextChange={noop}
        onGlossaryTextChange={noop}
        onOutputModeChange={setMode}
        onOverwriteChange={setOverwrite}
        onToggle={toggle}
      />
    </WizardShell>
  );
}

const SLF = "[Shangri-La Frontier]";
const SLF_FOLDER =
  "/mnt/ds920p/BT_Disk_3/[2024][Shangri-La Frontier S2][BDRIP][1080P][1-25(26-50)Fin+SP]/";

/**
 * Two files added directly from one long-named folder, a folder source, and
 * an archive source holding one unparsable file: every ledger group and row
 * kind, with paths and names long enough to truncate.
 */
const TRANSLATE_SAMPLE_SOURCES = [
  `${SLF_FOLDER}${SLF}[26][BDRIP][1080P][H264_FLAC].tc.srt`,
  `${SLF_FOLDER}${SLF}[27][BDRIP][1080P][H264_FLAC].tc.srt`,
  "/media/Show/Season 1/",
  "/home/jim/Downloads/Frieren_S01_subs.zip",
];

const TRANSLATE_SAMPLE_SCAN: TranslateScanResult = {
  files: [
    { name: `${SLF}[26][BDRIP][1080P][H264_FLAC].tc.srt`, source: TRANSLATE_SAMPLE_SOURCES[0], cueCount: 378, unparsable: false },
    { name: `${SLF}[27][BDRIP][1080P][H264_FLAC].tc.srt`, source: TRANSLATE_SAMPLE_SOURCES[1], cueCount: 372, unparsable: false },
    { name: "Show.S01E01.ja.srt", source: TRANSLATE_SAMPLE_SOURCES[2], cueCount: 0, unparsable: true },
    { name: "Frieren.S01E01.ja.ass", source: TRANSLATE_SAMPLE_SOURCES[3], cueCount: 412, unparsable: false },
    { name: "Frieren.S01E02.ja.ass", source: TRANSLATE_SAMPLE_SOURCES[3], cueCount: 389, unparsable: false },
  ],
  defaultTargetLanguage: "zh-TW",
};

/** Translate step 1 inside the real wizard frame; `?scanning=1` shows the scan in flight. Removal is live. */
function TranslateSourcesView({ scanning }: { scanning: boolean }) {
  const { t } = useTranslation("translate");
  const [sources, setSources] = useState(TRANSLATE_SAMPLE_SOURCES);
  const scan: TranslateScanResult = {
    ...TRANSLATE_SAMPLE_SCAN,
    files: TRANSLATE_SAMPLE_SCAN.files.filter((file) => sources.includes(file.source)),
  };
  return (
    <WizardShell
      steps={TRANSLATE_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }))}
      activeStep={0}
      next={{ label: t("sources.continue"), disabled: scanning, onClick: noop }}
    >
      <TranslateSourcesStep
        sources={sources}
        scan={scanning ? null : scan}
        isScanning={scanning}
        scanError={undefined}
        onBrowseFiles={noop}
        onBrowseFolder={noop}
        onRemoveSources={(paths) => setSources((current) => current.filter((path) => !paths.includes(path)))}
      />
    </WizardShell>
  );
}

type RunSample = "mid" | "resend" | "done";

/**
 * A three-file run replayed through the real reducer: the first file done in
 * 1:37, the second with batch 6 of 10 in flight (resent for `resend`), the
 * third waiting; `done` finishes all three. Batches take 4 s each.
 */
function translateRunSample(sample: RunSample): RunProgress {
  const files = [
    { id: 0, inputName: `${SLF}[26][BDRIP][1080P][H264_FLAC].tc.srt`, cueCount: 378 },
    { id: 1, inputName: `${SLF}[27][BDRIP][1080P][H264_FLAC].tc.srt`, cueCount: 372 },
    { id: 2, inputName: "Frieren.S01E01.ja.ass", cueCount: 412 },
  ];
  const events: Array<[TranslateProgress, number]> = [];
  let clock = 0;
  const push = (file: (typeof files)[number], extra: Partial<TranslateProgress>, advance = 0) => {
    clock += advance;
    events.push([
      {
        stage: "translating",
        index: file.id + 1,
        total: files.length,
        fileName: file.inputName,
        itemId: file.id,
        processedCues: 0,
        totalCues: file.cueCount,
        batchSize: 40,
        batchTotal: Math.ceil(file.cueCount / 40),
        batchesDone: 0,
        batchInFlight: 0,
        resend: false,
        outcome: null,
        ...extra,
      },
      clock,
    ]);
  };
  const translate = (file: (typeof files)[number], upTo: number) => {
    const batches = Math.ceil(file.cueCount / 40);
    push(file, { stage: "terminology" });
    for (let batch = 1; batch <= Math.min(upTo, batches); batch += 1) {
      const before = Math.min((batch - 1) * 40, file.cueCount);
      push(file, { batchInFlight: batch, batchesDone: batch - 1, processedCues: before }, batch === 1 ? 4000 : 0);
      if (batch === upTo && upTo <= batches && sample !== "done" && file.id === 1) return;
      push(file, { batchesDone: batch, processedCues: Math.min(batch * 40, file.cueCount) }, 4000);
    }
    push(file, { stage: "writing", batchesDone: batches, processedCues: file.cueCount });
    push(file, { stage: "fileDone", batchesDone: batches, processedCues: file.cueCount, outcome: "translated" }, 1000);
  };
  translate(files[0], 10);
  if (sample === "done") {
    translate(files[1], 10);
    translate(files[2], 11);
    push(files[2], { stage: "finished", itemId: 0, fileName: "" });
  } else {
    translate(files[1], 6);
    if (sample === "resend") {
      push(files[1], { batchInFlight: 6, batchesDone: 5, processedCues: 200, resend: true }, 3000);
    }
  }
  return events.reduce((state, [event, at]) => reduceProgress(state, event, at), seedProgress(files, 0));
}

/** Translate step 3 inside the real wizard frame; `?state=mid|resend|done`. */
function TranslateRunView() {
  const { t } = useTranslation("translate");
  const state = params.get("state");
  const sample: RunSample = state === "resend" || state === "done" ? state : "mid";
  return (
    <WizardShell
      steps={TRANSLATE_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }))}
      activeStep={2}
      secondary={{ label: t("run.cancel"), onClick: noop }}
      next={{ label: t("run.translating"), disabled: true, onClick: noop }}
    >
      <TranslateRunStep
        selectedCount={3}
        isTranslating
        progress={translateRunSample(sample)}
        translateError={undefined}
      />
    </WizardShell>
  );
}

/**
 * Cues in the first seconds of any reviewer-supplied media, with markup to
 * strip. The first two overlap from 0, so `?ms=0` shows both on a paused stage.
 */
const HARNESS_CUES = [
  { startMs: 0, endMs: 4_000, text: "{\\an8}<i>The first line</i> of the subtitle" },
  { startMs: 0, endMs: 2_500, text: "Two speakers\\Nat the same time" },
  { startMs: 4_500, endMs: 7_000, text: "- A cue of its own" },
  { startMs: 8_000, endMs: 12_000, text: "A longer cue that runs for a while, long enough to wrap on a narrow window" },
];

/** The fixture media state `?media=` asks for; `?src=` is any playable URL. */
function harnessMedia(): PreviewMedia {
  const url = params.get("src") ?? "";
  switch (pinned("media", ["video", "preparing", "audio", "none", "unavailable"] as const)) {
    case "preparing":
      return { status: "preparing", reason: "failed" };
    case "audio":
      return { status: "audio", url };
    case "none":
      return { status: "none" };
    case "unavailable":
      return {
        status: "unavailable",
        error: {
          code: "preview.audio_unsupported",
          message: "the media has no audio stream",
          hintCode: null,
        },
        canReturn: true,
      };
    default:
      return { status: "video", url };
  }
}

/** The detection `?detection=` and `?warnings=` ask for. */
function harnessDetection(): SyncDetectionDto | null {
  if (params.get("detection") === "0") return null;
  const count = Math.max(0, Math.min(2, Number(params.get("warnings") ?? "0") || 0));
  const warnings = [
    {
      code: "sync.detection_warning",
      message: "Detected offset 61.00s exceeds configured maximum value 60.00s",
      hintCode: null,
    },
    {
      code: "sync.detection_warning",
      message: "The correlation peak is close to the second best candidate",
      hintCode: null,
    },
  ].slice(0, count);
  return { offsetMs: 750, confidence: 82, warnings };
}

/**
 * Sync step 3 inside the wizard frame with a fixture preview session: `?media=video|preparing|audio|none|unavailable`,
 * `?cue-error=1`, `?src=<http url>` for the media to play, `?ms=` to seed
 * the offset, `?detection=0` for a skipped detection and `?warnings=2` for
 * two detection warnings. Without `src` the media element has no source.
 */
function SyncOffsetHarness() {
  const { t } = useTranslation("sync");
  const initial = Number(params.get("ms") ?? "750");
  const [offsetMs, setOffsetMs] = useState(Number.isFinite(initial) ? initial : 0);
  const [session] = useState<PreviewSession>(() => ({
    media: harnessMedia(),
    cues: HARNESS_CUES,
    cueError:
      params.get("cue-error") === "1"
        ? { code: "core.subtitle_format", message: "unexpected end of the cue at line 12", hintCode: null }
        : undefined,
    onMediaError: noop,
    requestAudio: noop,
    returnToVideo: noop,
  }));
  const exceedsMax = Math.abs(offsetMs) > SYNC_DEFAULTS.maxOffsetMs;
  // Inside the real wizard frame: the stage's height comes from the panel.
  return (
    <WizardShell
      steps={SYNC_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }))}
      activeStep={2}
      back={{ label: t("offset.back"), onClick: noop }}
      next={{ label: t("offset.continue"), disabled: exceedsMax, onClick: noop }}
    >
      <SyncOffsetView
        session={session}
        defaults={SYNC_DEFAULTS}
        detection={harnessDetection()}
        offsetMs={offsetMs}
        offsetExceedsMax={exceedsMax}
        onOffsetChange={setOffsetMs}
      />
    </WizardShell>
  );
}

function SyncApplyView() {
  const [outputPath, setOutputPath] = useState("/media/Show/ep03_synced.srt");
  return (
    <SyncApplyStep
      offsetMs={750}
      subtitlePath="/media/Show/ep03.srt"
      outputPath={outputPath}
      applyResult={null}
      applyError={undefined}
      onOutputPathChange={setOutputPath}
    />
  );
}

/**
 * Sync step 2 inside the real wizard frame, with the action bar `SyncWizard`
 * builds for it. `?phase=ask|detecting|failed`, `?media=0` drops the media
 * file, and `?kept=1` adds the kept offset of a visit to step 3.
 */
function SyncDetectView() {
  const { t } = useTranslation("sync");
  const requested = params.get("phase");
  const phase: DetectPhase =
    requested === "detecting" || requested === "failed" ? requested : "ask";
  const hasMedia = params.get("media") !== "0";
  const kept = params.get("kept") === "1";
  // The fixture's sensitivity is not a percentage; the wizard always holds one.
  const [sensitivity, setSensitivity] = useState(40);
  const keptMs = 1_254;

  const skip: WizardNavAction = { label: t("detect.skip"), onClick: noop };
  const start: WizardNavAction = { label: t("detect.start"), onClick: noop };
  const keep: WizardNavAction = {
    label: t("detect.keep", { offset: formatSeconds(keptMs) }),
    accessibleLabel: t("detect.keepLabel", {
      offset: formatSeconds(keptMs),
      seconds: (keptMs / 1000).toFixed(3),
    }),
    onClick: noop,
  };
  const back: WizardNavAction | undefined =
    phase === "detecting" ? undefined : { label: t("detect.back"), onClick: noop };
  let secondary: WizardNavAction | readonly [WizardNavAction, WizardNavAction] | undefined;
  let next: WizardNavAction;
  if (phase === "detecting") {
    secondary = { label: t("detect.cancel"), onClick: noop };
    next = { label: t("detect.detecting"), disabled: true };
  } else if (phase === "failed") {
    next = { label: t("detect.retry"), onClick: noop };
    secondary = kept ? [skip, keep] : skip;
  } else if (kept) {
    next = keep;
    secondary = hasMedia ? [skip, start] : skip;
  } else if (!hasMedia) {
    next = skip;
  } else {
    next = start;
    secondary = skip;
  }

  return (
    <WizardShell
      steps={SYNC_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }))}
      activeStep={1}
      back={back}
      secondary={secondary}
      next={next}
    >
      <SyncDetectStep
        phase={phase}
        hasMedia={hasMedia}
        defaults={SYNC_DEFAULTS}
        defaultsError={undefined}
        sensitivity={sensitivity}
        detectError={
          phase === "failed"
            ? {
                code: "sync.vad_unavailable",
                message: "VAD detector is required but not available",
                hintCode: "sync.vad_unavailable.hint",
              }
            : undefined
        }
        onSensitivityChange={setSensitivity}
      />
    </WizardShell>
  );
}

/**
 * The Settings sections with fixture props: the real screen loads through IPC.
 * Mirrors `SettingsScreen`'s markup — a configured key, a successful test.
 */
function SettingsView() {
  const { t } = useTranslation("settings");
  const [apiKey, setApiKey] = useState("");
  const { provider, model, baseUrl } = CONFIG.ai;
  return (
    <section className="settings">
      <section className="settings-section">
        <header className="settings-section__header">
          <h2 className="settings-section__title">{t("ai.title")}</h2>
          <span className="settings-section__where">{t("ai.storedIn")}</span>
        </header>
        <AiSettingsSection
          draft={{ provider, model, baseUrl, apiKey }}
          saved={CONFIG.ai}
          fieldErrors={{}}
          disabled={false}
          onChange={(field, value) => field === "apiKey" && setApiKey(value)}
        />
        <ConnectionTestPanel
          status="done"
          result={{ ok: true, latencyMs: 132, error: null }}
          busy={false}
          onTest={noop}
        />
      </section>
      <section className="settings-section">
        <header className="settings-section__header">
          <h2 className="settings-section__title">{t("preferences.title")}</h2>
          <span className="settings-section__where">{t("preferences.storedIn")}</span>
        </header>
        <PreferencesSection />
      </section>
    </section>
  );
}

export const VIEWS: Record<string, () => JSX.Element> = {
  app: () => <App />,
  SourcesStep: () => (
    <SourcesStep
      sources={[]}
      scan={null}
      isScanning={false}
      scanError={undefined}
      mode="rename"
      onBrowseFiles={noop}
      onBrowseFolder={noop}
      onRemoveSources={noop}
      onModeChange={noop}
    />
  ),
  "match-sources-empty": () => <MatchSourcesView initial={[]} />,
  "match-sources-long": () => <MatchSourcesView initial={LONG_SOURCES} />,
  "match-review": () => <MatchReviewView />,
  "match-analysis": () => <MatchAnalysisView />,
  "match-execute": () => <MatchExecuteView />,
  "convert-sources": () => <ConvertSourcesView />,
  "convert-options": () => <ConvertOptionsView />,
  "convert-run": () => <ConvertRunView />,
  "translate-sources": () => <TranslateSourcesView scanning={params.get("scanning") === "1"} />,
  "translate-options": () => <TranslateOptionsView />,
  "translate-run": () => <TranslateRunView />,
  "sync-offset": () => <SyncOffsetHarness />,
  "sync-apply": () => <SyncApplyView />,
  "sync-detect": () => <SyncDetectView />,
  settings: () => <SettingsView />,
  AnalysisStep: () => <AnalysisStep stage="analyzing" error={undefined} scan={{ videoCount: 1, subtitleCount: 1 }} />,
  ReviewStep: () => (
    <ReviewStep plan={REVIEW_PLAN} selectedIds={new Set([0, 1, 2])} onToggle={noop} onToggleLanguage={noop} />
  ),
  ExecuteStep: () => (
    <ExecuteStep
      plan={EXECUTION_PLAN}
      selectedIds={new Set([0])}
      mode="rename"
      isExecuting={false}
      report={EXECUTION_REPORT}
      executeError={undefined}
    />
  ),
  ConvertSourcesStep: () => (
    <ConvertSourcesStep
      sources={[]}
      scan={null}
      isScanning={false}
      scanError={undefined}
      onBrowseFiles={noop}
      onBrowseFolder={noop}
      onRemoveSources={noop}
    />
  ),
  ConvertOptionsStep: () => (
    <ConvertOptionsStep
      targetFormat="srt"
      keepOriginal
      plan={CONVERT_PLAN}
      isPreviewing={false}
      previewError={undefined}
      selectedIds={new Set()}
      onFormatChange={noop}
      onKeepOriginalChange={noop}
      onToggle={noop}
    />
  ),
  ConvertRunStep: () => (
    <ConvertRunStep
      targetFormat="srt"
      selectedCount={0}
      keepOriginal
      plan={CONVERT_PLAN}
      selectedIds={new Set()}
      isConverting={false}
      progress={null}
      report={null}
      convertError={undefined}
    />
  ),
  SyncInputsStep: () => (
    <SyncInputsStep
      mediaPath={null}
      subtitlePath={null}
      onBrowseMedia={noop}
      onBrowseSubtitle={noop}
      onClearMedia={noop}
      onClearSubtitle={noop}
    />
  ),
  SyncDetectStep: () => (
    <SyncDetectStep
      phase="ask"
      hasMedia={false}
      defaults={SYNC_DEFAULTS}
      defaultsError={undefined}
      sensitivity={SYNC_DEFAULTS.vadSensitivity}
      detectError={undefined}
      onSensitivityChange={noop}
    />
  ),
  SyncOffsetStep: () => (
    <SyncOffsetStep
      mediaPath={null}
      subtitlePath={null}
      defaults={SYNC_DEFAULTS}
      detection={null}
      offsetMs={0}
      offsetExceedsMax={false}
      onOffsetChange={noop}
    />
  ),
  SyncApplyStep: () => (
    <SyncApplyStep
      offsetMs={0}
      subtitlePath={null}
      outputPath=""
      applyResult={null}
      applyError={undefined}
      onOutputPathChange={noop}
    />
  ),
  TranslateSourcesStep: () => (
    <TranslateSourcesStep
      sources={[]}
      scan={null}
      isScanning={false}
      scanError={undefined}
      onBrowseFiles={noop}
      onBrowseFolder={noop}
      onRemoveSources={noop}
    />
  ),
  TranslateOptionsStep: () => (
    <TranslateOptionsStep
      plan={TRANSLATE_PLAN}
      isPreviewing={false}
      previewError={undefined}
      targetLanguage="zh-TW"
      sourceLanguage=""
      context=""
      glossaryText=""
      outputMode="suffix"
      overwrite={false}
      selectedIds={new Set()}
      onTargetLanguageChange={noop}
      onSourceLanguageChange={noop}
      onContextChange={noop}
      onGlossaryTextChange={noop}
      onOutputModeChange={noop}
      onOverwriteChange={noop}
      onToggle={noop}
    />
  ),
  TranslateRunStep: () => (
    <TranslateRunStep selectedCount={3} isTranslating={true} progress={TRANSLATE_RUN_PROGRESS} translateError={undefined} />
  ),
  TranslateReportStep: () => <TranslateReportStep report={TRANSLATE_REPORT} />,
};
