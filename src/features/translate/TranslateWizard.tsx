import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { WizardShell } from "../../components/WizardShell/WizardShell";
import type { WizardStep } from "../../components/WizardShell/WizardShell";
import { pickFiles, pickFolder, subscribeToDroppedPaths } from "../../platform/filePickers";
import { TranslateOptionsStep } from "./TranslateOptionsStep";
import { TranslateReportStep } from "./TranslateReportStep";
import { TranslateRunStep } from "./TranslateRunStep";
import { TranslateSourcesStep } from "./TranslateSourcesStep";
import { TRANSLATE_STEPS, useTranslateWizard } from "./useTranslateWizard";

interface TranslateWizardProps {
  /** Opens the Settings screen — the recovery route when no AI is configured. */
  onOpenSettings: () => void;
}

interface NavAction {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * The four-step translate wizard on `WizardShell`.
 *
 * All state lives in `useTranslateWizard`; this component wires that state to
 * the shell's navigation and to the presentational step components, and
 * subscribes to window file drops. Step 3 (Translate) and Step 4 (Report) are
 * distinct steps rather than one merged view, unlike convert's "run" step —
 * the wizard advances to Report only once a batch actually resolves.
 */
export function TranslateWizard({ onOpenSettings }: TranslateWizardProps) {
  const { t } = useTranslation("translate");
  const wizard = useTranslateWizard();
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

  const steps: WizardStep[] = TRANSLATE_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }));
  const activeStep = TRANSLATE_STEPS.indexOf(wizard.step);

  let back: NavAction | undefined;
  let next: NavAction | undefined;
  if (wizard.step === "sources") {
    next = {
      label: t("sources.continue"),
      disabled: !wizard.canPreview,
      onClick: wizard.toOptions,
    };
  } else if (wizard.step === "options") {
    // Going back invalidates the plan: the backend holds one plan at a time
    // and the next visit previews again from whatever the sources are by then.
    back = { label: t("options.back"), onClick: wizard.restart };
    next = {
      label: t("options.continue"),
      disabled: wizard.selectedCount === 0 || wizard.isPreviewing,
      onClick: wizard.toTranslate,
    };
  }

  return (
    <WizardShell steps={steps} activeStep={activeStep} back={back} next={next}>
      {wizard.step === "sources" && (
        <TranslateSourcesStep
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
        <TranslateOptionsStep
          plan={wizard.plan}
          isPreviewing={wizard.isPreviewing}
          previewError={wizard.previewError}
          targetLanguage={wizard.targetLanguage}
          sourceLanguage={wizard.sourceLanguage}
          context={wizard.context}
          glossaryText={wizard.glossaryText}
          outputMode={wizard.outputMode}
          overwrite={wizard.overwrite}
          selectedIds={wizard.selectedIds}
          onTargetLanguageChange={wizard.setTargetLanguage}
          onSourceLanguageChange={wizard.setSourceLanguage}
          onContextChange={wizard.setContext}
          onGlossaryTextChange={wizard.setGlossaryText}
          onOutputModeChange={wizard.setOutputMode}
          onOverwriteChange={wizard.setOverwrite}
          onToggle={wizard.toggleSelection}
        />
      )}
      {wizard.step === "translate" && (
        <TranslateRunStep
          selectedCount={wizard.selectedCount}
          isTranslating={wizard.isTranslating}
          progress={wizard.progress}
          translateError={wizard.translateError}
          onTranslate={() => void wizard.translate()}
          onCancel={() => void wizard.cancel()}
          onOpenSettings={onOpenSettings}
          onRestart={wizard.restart}
        />
      )}
      {wizard.step === "report" && (
        <TranslateReportStep report={wizard.report} onFinish={wizard.restart} />
      )}
    </WizardShell>
  );
}
