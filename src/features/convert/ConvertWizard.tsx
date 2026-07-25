import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { WizardShell } from "../../components/WizardShell/WizardShell";
import type { WizardStep } from "../../components/WizardShell/WizardShell";
import { pickFiles, pickFolder, subscribeToDroppedPaths } from "../../platform/filePickers";
import { ConvertOptionsStep } from "./ConvertOptionsStep";
import { ConvertRunStep } from "./ConvertRunStep";
import { ConvertSourcesStep } from "./ConvertSourcesStep";
import { CONVERT_STEPS, useConvertWizard } from "./useConvertWizard";

interface NavAction {
  label: string;
  disabled?: boolean;
  onClick: () => void;
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

  let back: NavAction | undefined;
  let next: NavAction | undefined;
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
  }

  return (
    <WizardShell steps={steps} activeStep={activeStep} back={back} next={next}>
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
          onConvert={() => void wizard.convert()}
          onCancel={() => void wizard.cancel()}
          onRestart={wizard.restart}
        />
      )}
    </WizardShell>
  );
}
