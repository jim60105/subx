import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { WizardShell } from "../../components/WizardShell/WizardShell";
import type { WizardNavAction, WizardStep } from "../../components/WizardShell/WizardShell";
import { pickFiles, pickFolder, subscribeToDroppedPaths } from "../../platform/filePickers";
import { isErrorDto } from "../../types/ipc";
import { ConvertOptionsStep } from "./ConvertOptionsStep";
import { ConvertRunStep } from "./ConvertRunStep";
import { ConvertSourcesStep } from "./ConvertSourcesStep";
import { CONVERT_STEPS, useConvertWizard } from "./useConvertWizard";

/** A stale plan is the one failure with a distinct recovery: preview again. */
function isStalePlan(error: unknown): boolean {
  return isErrorDto(error) && error.code === "convert.stale_plan";
}

/**
 * The three-step convert wizard on `WizardShell`.
 *
 * All state lives in `useConvertWizard`; this component wires that state to the
 * shell's navigation and to the presentational step components, and subscribes
 * to window file drops.
 */
export function ConvertWizard() {
  const { t } = useTranslation("convert");
  const wizard = useConvertWizard();
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

  const steps: WizardStep[] = CONVERT_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }));
  const activeStep = CONVERT_STEPS.indexOf(wizard.step);

  // Every action the wizard offers, on every step, lives in the shell's bar so
  // the primary control never moves; the step components only render state.
  let back: WizardNavAction | undefined;
  let secondary: WizardNavAction | undefined;
  let next: WizardNavAction | undefined;
  if (wizard.step === "sources") {
    next = {
      label: t("sources.continue"),
      disabled: !wizard.canPreview,
      onClick: wizard.toOptions,
    };
  } else if (wizard.step === "options") {
    // Going back invalidates the plan: the backend holds one plan at a time and
    // the next visit previews again from whatever the sources are by then.
    back = { label: t("options.back"), onClick: wizard.restart };
    next = {
      label: t("options.continue"),
      disabled: wizard.selectedCount === 0 || wizard.isPreviewing,
      onClick: wizard.toRun,
    };
  } else if (wizard.isConverting) {
    secondary = { label: t("run.cancel"), onClick: () => void wizard.cancel() };
    next = { label: t("run.converting"), disabled: true };
  } else if (wizard.report !== null || isStalePlan(wizard.convertError)) {
    next = { label: t("run.report.finish"), onClick: wizard.restart };
  } else if (wizard.convertError === undefined) {
    next = {
      label: t("run.start"),
      disabled: wizard.selectedCount === 0,
      onClick: () => void wizard.convert(),
    };
  }
  // Any other convert failure has no forward move today, and this change is
  // about placement only — it must not invent one.

  return (
    <WizardShell
      steps={steps}
      activeStep={activeStep}
      back={back}
      secondary={secondary}
      next={next}
    >
      {wizard.step === "sources" && (
        <ConvertSourcesStep
          sources={wizard.sources}
          scan={wizard.scan}
          isScanning={wizard.isScanning}
          scanError={wizard.scanError}
          onBrowseFiles={() => void pickFiles().then(addSources)}
          onBrowseFolder={() => void pickFolder().then(addSources)}
          onRemoveSource={wizard.removeSource}
        />
      )}
      {wizard.step === "options" && (
        <ConvertOptionsStep
          targetFormat={wizard.targetFormat}
          keepOriginal={wizard.keepOriginal}
          plan={wizard.plan}
          isPreviewing={wizard.isPreviewing}
          previewError={wizard.previewError}
          selectedIds={wizard.selectedIds}
          onFormatChange={wizard.setTargetFormat}
          onKeepOriginalChange={wizard.setKeepOriginal}
          onToggle={wizard.toggleSelection}
        />
      )}
      {wizard.step === "run" && (
        <ConvertRunStep
          targetFormat={wizard.targetFormat}
          selectedCount={wizard.selectedCount}
          keepOriginal={wizard.keepOriginal}
          isConverting={wizard.isConverting}
          progress={wizard.progress}
          report={wizard.report}
          convertError={wizard.convertError}
        />
      )}
    </WizardShell>
  );
}
