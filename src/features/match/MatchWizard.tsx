import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { WizardShell } from "../../components/WizardShell/WizardShell";
import type { WizardStep } from "../../components/WizardShell/WizardShell";
import { pickFiles, pickFolder, subscribeToDroppedPaths } from "../../platform/filePickers";
import { AnalysisStep } from "./AnalysisStep";
import { ExecuteStep } from "./ExecuteStep";
import { ReviewStep } from "./ReviewStep";
import { SourcesStep } from "./SourcesStep";
import { useMatchWizard, WIZARD_STEPS } from "./useMatchWizard";

interface MatchWizardProps {
  /** Routes the "no AI provider" error's action to the Settings screen. */
  onOpenSettings: () => void;
}

interface NavAction {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * The four-step match wizard on `WizardShell`.
 *
 * All state lives in `useMatchWizard`; this component wires that state to the
 * shell's navigation and to the presentational step components, and subscribes
 * to window file drops.
 */
export function MatchWizard({ onOpenSettings }: MatchWizardProps) {
  const { t } = useTranslation("match");
  const wizard = useMatchWizard();
  const { addSources } = wizard;

  // Window-level OS file drops feed the source list for the life of the screen.
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void subscribeToDroppedPaths(addSources).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [addSources]);

  const steps: WizardStep[] = WIZARD_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }));
  const activeStep = WIZARD_STEPS.indexOf(wizard.step);

  let back: NavAction | undefined;
  let next: NavAction | undefined;
  if (wizard.step === "sources") {
    next = {
      label: t("sources.analyze"),
      disabled: !wizard.canAnalyze,
      onClick: () => void wizard.analyze(),
    };
  } else if (wizard.step === "review") {
    back = { label: t("review.back"), onClick: wizard.restart };
    next = {
      label: t("review.execute"),
      disabled: wizard.selectedCount === 0,
      onClick: wizard.toExecute,
    };
  } else if (wizard.step === "execute") {
    back = {
      label: t("execute.back"),
      disabled: wizard.isExecuting || wizard.report !== null,
      onClick: wizard.toReview,
    };
  }

  return (
    <WizardShell steps={steps} activeStep={activeStep} back={back} next={next}>
      {wizard.step === "sources" && (
        <SourcesStep
          sources={wizard.sources}
          scan={wizard.scan}
          isScanning={wizard.isScanning}
          scanError={wizard.scanError}
          mode={wizard.mode}
          onBrowseFiles={() => void pickFiles().then(addSources)}
          onBrowseFolder={() => void pickFolder().then(addSources)}
          onRemoveSource={wizard.removeSource}
          onModeChange={wizard.setMode}
        />
      )}
      {wizard.step === "analysis" && (
        <AnalysisStep
          stage={wizard.stage}
          error={wizard.analysisError}
          onCancel={() => void wizard.cancel()}
          onRetry={wizard.retry}
          onOpenSettings={onOpenSettings}
        />
      )}
      {wizard.step === "review" && wizard.plan !== null && (
        <ReviewStep
          plan={wizard.plan}
          selectedIds={wizard.selectedIds}
          onToggle={wizard.toggleSelection}
        />
      )}
      {wizard.step === "execute" && (
        <ExecuteStep
          mode={wizard.mode}
          selectedCount={wizard.selectedCount}
          isExecuting={wizard.isExecuting}
          report={wizard.report}
          executeError={wizard.executeError}
          onExecute={() => void wizard.execute()}
          onRestart={wizard.restart}
        />
      )}
    </WizardShell>
  );
}
