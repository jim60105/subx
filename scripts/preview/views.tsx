/**
 * Every screen the review harness can show, each with the fixture props the
 * hard-coded-string gate renders it with. Later changes register their new
 * views here.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import App from "../../src/App";
import { WizardShell } from "../../src/components/WizardShell/WizardShell";
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
import { OffsetField } from "../../src/features/sync/OffsetField";
import { SyncApplyStep } from "../../src/features/sync/SyncApplyStep";
import { SyncDetectStep } from "../../src/features/sync/SyncDetectStep";
import { SyncInputsStep } from "../../src/features/sync/SyncInputsStep";
import { SyncMethodStep } from "../../src/features/sync/SyncMethodStep";
import { TranslateOptionsStep } from "../../src/features/translate/TranslateOptionsStep";
import { TranslateReportStep } from "../../src/features/translate/TranslateReportStep";
import { TranslateRunStep } from "../../src/features/translate/TranslateRunStep";
import { TranslateSourcesStep } from "../../src/features/translate/TranslateSourcesStep";
import { TRANSLATE_STEPS } from "../../src/features/translate/useTranslateWizard";
import {
  CONFIG,
  CONVERT_PLAN,
  TRANSLATE_PLAN,
  EXECUTION_PLAN,
  EXECUTION_REPORT,
  REVIEW_PLAN,
  SYNC_DEFAULTS,
  TRANSLATE_REPORT,
} from "../../src/test/screenFixtures";
import type {
  ConvertFormatDto,
  ConvertPlanDto,
  ExecutionReportDto,
  MatchOperationDto,
  MatchPlanDto,
  MatchStage,
  RelocationModeDto,
  TranslateOutputModeDto,
  TranslatePlanDto,
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

/** `?ms=` seeds the offset so a screenshot can pin a positive, zero or negative value. */
function SyncOffsetView() {
  const initial = Number(params.get("ms") ?? "750");
  const [offsetMs, setOffsetMs] = useState(Number.isFinite(initial) ? initial : 0);
  return (
    <OffsetField
      offsetMs={offsetMs}
      maxOffsetMs={SYNC_DEFAULTS.maxOffsetMs}
      exceedsMax={Math.abs(offsetMs) > SYNC_DEFAULTS.maxOffsetMs}
      onChange={setOffsetMs}
    />
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

function SyncMethodView() {
  const [sensitivity, setSensitivity] = useState(50);
  return (
    <SyncMethodStep
      method="auto"
      hasMedia
      defaults={SYNC_DEFAULTS}
      defaultsError={undefined}
      sensitivity={sensitivity}
      offsetMs={0}
      offsetExceedsMax={false}
      onMethodChange={noop}
      onSensitivityChange={setSensitivity}
      onOffsetChange={noop}
    />
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
  "translate-options": () => <TranslateOptionsView />,
  "sync-offset": () => <SyncOffsetView />,
  "sync-apply": () => <SyncApplyView />,
  "sync-method": () => <SyncMethodView />,
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
  SyncMethodStep: () => (
    <SyncMethodStep
      method="manual"
      hasMedia={false}
      defaults={SYNC_DEFAULTS}
      defaultsError={undefined}
      sensitivity={0.5}
      offsetMs={0}
      offsetExceedsMax={false}
      onMethodChange={noop}
      onSensitivityChange={noop}
      onOffsetChange={noop}
    />
  ),
  SyncDetectStep: () => (
    <SyncDetectStep
      method="manual"
      defaults={SYNC_DEFAULTS}
      isDetecting={false}
      detection={null}
      detectError={undefined}
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
    <TranslateRunStep selectedCount={1} isTranslating={true} progress={null} translateError={undefined} />
  ),
  TranslateReportStep: () => <TranslateReportStep report={TRANSLATE_REPORT} />,
};
