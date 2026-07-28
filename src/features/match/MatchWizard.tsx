import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { WizardShell } from "../../components/WizardShell/WizardShell";
import type { WizardNavAction, WizardStep } from "../../components/WizardShell/WizardShell";
import { pickFiles, pickFolder, subscribeToDroppedPaths } from "../../platform/filePickers";
import { isErrorDto } from "../../types/ipc";
import { AnalysisStep } from "./AnalysisStep";
import { ExecuteStep } from "./ExecuteStep";
import { ReviewStep } from "./ReviewStep";
import { SourcesStep } from "./SourcesStep";
import { useMatchWizard, WIZARD_STEPS } from "./useMatchWizard";

interface MatchWizardProps {
  /** Routes the "no AI provider" error's action to the Settings screen. */
  onOpenSettings: () => void;
}

/** Whether the failure is a missing AI provider, which links to Settings. */
function isNotConfigured(error: unknown): boolean {
  return isErrorDto(error) && error.code === "match.ai_not_configured";
}

/** A stale plan is the one execute failure with a distinct recovery: re-analyze. */
function isStalePlan(error: unknown): boolean {
  return isErrorDto(error) && error.code === "match.stale_plan";
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

  // Every action the wizard offers, on every step, lives in the shell's bar so
  // the primary control never moves; the step components only render state.
  let back: WizardNavAction | undefined;
  let secondary: WizardNavAction | undefined;
  let next: WizardNavAction | undefined;
  if (wizard.step === "sources") {
    next = {
      label: t("sources.analyze"),
      disabled: !wizard.canAnalyze,
      onClick: () => void wizard.analyze(),
    };
  } else if (wizard.step === "analysis") {
    if (wizard.analysisError !== undefined) {
      if (isNotConfigured(wizard.analysisError)) {
        secondary = { label: t("analysis.openSettings"), onClick: onOpenSettings };
      }
      next = { label: t("analysis.retry"), onClick: wizard.retry };
    } else {
      secondary = { label: t("analysis.cancel"), onClick: () => void wizard.cancel() };
      next = { label: t("analysis.running"), disabled: true };
    }
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
    if (wizard.report !== null || isStalePlan(wizard.executeError)) {
      next = { label: t("execute.report.finish"), onClick: wizard.restart };
    } else if (wizard.executeError === undefined) {
      // Any other execute failure has no recovery beyond stepping back, which
      // is what the panel's error notice already points at.
      next = {
        label: wizard.isExecuting ? t("execute.running") : t("execute.run"),
        disabled: wizard.isExecuting || wizard.selectedCount === 0,
        onClick: () => void wizard.execute(),
      };
    }
  }

  return (
    <WizardShell
      steps={steps}
      activeStep={activeStep}
      back={back}
      secondary={secondary}
      next={next}
    >
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
        <AnalysisStep stage={wizard.stage} error={wizard.analysisError} />
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
          report={wizard.report}
          executeError={wizard.executeError}
        />
      )}
    </WizardShell>
  );
}
