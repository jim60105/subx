/**
 * Every screen the review harness can show, each with the fixture props the
 * hard-coded-string gate renders it with. Later changes register their new
 * views here.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";

import App from "../../src/App";
import { WizardShell } from "../../src/components/WizardShell/WizardShell";
import { ConvertOptionsStep } from "../../src/features/convert/ConvertOptionsStep";
import { ConvertRunStep } from "../../src/features/convert/ConvertRunStep";
import { ConvertSourcesStep } from "../../src/features/convert/ConvertSourcesStep";
import { AnalysisStep } from "../../src/features/match/AnalysisStep";
import { ExecuteStep } from "../../src/features/match/ExecuteStep";
import { ReviewStep } from "../../src/features/match/ReviewStep";
import { SourcesStep } from "../../src/features/match/SourcesStep";
import { WIZARD_STEPS } from "../../src/features/match/useMatchWizard";
import { SyncApplyStep } from "../../src/features/sync/SyncApplyStep";
import { SyncDetectStep } from "../../src/features/sync/SyncDetectStep";
import { SyncInputsStep } from "../../src/features/sync/SyncInputsStep";
import { SyncMethodStep } from "../../src/features/sync/SyncMethodStep";
import { TranslateOptionsStep } from "../../src/features/translate/TranslateOptionsStep";
import { TranslateReportStep } from "../../src/features/translate/TranslateReportStep";
import { TranslateRunStep } from "../../src/features/translate/TranslateRunStep";
import { TranslateSourcesStep } from "../../src/features/translate/TranslateSourcesStep";
import {
  EMPTY_CONVERT_PLAN,
  EMPTY_TRANSLATE_PLAN,
  EXECUTION_REPORT,
  REVIEW_PLAN,
  SYNC_DEFAULTS,
  TRANSLATE_REPORT,
} from "../../src/test/screenFixtures";
import type { RelocationModeDto } from "../../src/types/ipc";

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
  AnalysisStep: () => <AnalysisStep stage="analyzing" error={undefined} />,
  ReviewStep: () => (
    <ReviewStep plan={REVIEW_PLAN} selectedIds={new Set([0, 1, 2])} onToggle={noop} onToggleLanguage={noop} />
  ),
  ExecuteStep: () => (
    <ExecuteStep mode="rename" selectedCount={1} report={EXECUTION_REPORT} executeError={undefined} />
  ),
  ConvertSourcesStep: () => (
    <ConvertSourcesStep
      sources={[]}
      scan={null}
      isScanning={false}
      scanError={undefined}
      onBrowseFiles={noop}
      onBrowseFolder={noop}
      onRemoveSource={noop}
    />
  ),
  ConvertOptionsStep: () => (
    <ConvertOptionsStep
      targetFormat="srt"
      keepOriginal
      plan={EMPTY_CONVERT_PLAN}
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
      onRemoveSource={noop}
    />
  ),
  TranslateOptionsStep: () => (
    <TranslateOptionsStep
      plan={EMPTY_TRANSLATE_PLAN}
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
