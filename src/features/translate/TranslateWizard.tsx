import { useEffect } from "react";
import { useTranslation } from "react-i18next";

import { WizardShell } from "../../components/WizardShell/WizardShell";
import type { WizardNavAction, WizardStep } from "../../components/WizardShell/WizardShell";
import { pickFiles, pickFolder, subscribeToDroppedPaths } from "../../platform/filePickers";
import { isErrorDto } from "../../types/ipc";
import { TranslateOptionsStep } from "./TranslateOptionsStep";
import { TranslateReportStep } from "./TranslateReportStep";
import { TranslateRunStep } from "./TranslateRunStep";
import { TranslateSourcesStep } from "./TranslateSourcesStep";
import { TRANSLATE_STEPS, useTranslateWizard } from "./useTranslateWizard";

interface TranslateWizardProps {
  /** Opens the Settings screen — the recovery route when no AI is configured. */
  onOpenSettings: () => void;
}

/** Whether the failure is a missing AI provider, which links to Settings. */
function isNotConfigured(error: unknown): boolean {
  return isErrorDto(error) && error.code === "translate.ai_not_configured";
}

/** A stale plan is the one failure with a distinct recovery: preview again. */
function isStalePlan(error: unknown): boolean {
  return isErrorDto(error) && error.code === "translate.stale_plan";
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
    // Going back invalidates the plan: the backend holds one plan at a time
    // and the next visit previews again from whatever the sources are by then.
    back = { label: t("options.back"), onClick: wizard.restart };
    next = {
      label: t("options.continue"),
      disabled: wizard.selectedCount === 0 || wizard.isPreviewing,
      onClick: wizard.toTranslate,
    };
  } else if (wizard.step === "translate") {
    if (wizard.isTranslating) {
      secondary = { label: t("run.cancel"), onClick: () => void wizard.cancel() };
      next = { label: t("run.translating"), disabled: true };
    } else if (wizard.translateError !== undefined) {
      if (isNotConfigured(wizard.translateError)) {
        secondary = { label: t("run.openSettings"), onClick: onOpenSettings };
      }
      next = isStalePlan(wizard.translateError)
        ? { label: t("run.restart"), onClick: wizard.restart }
        : { label: t("run.retry"), onClick: () => void wizard.translate() };
    } else {
      next = {
        label: t("run.start"),
        disabled: wizard.selectedCount === 0,
        onClick: () => void wizard.translate(),
      };
    }
  } else {
    next = { label: t("report.finish"), onClick: wizard.restart };
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
        />
      )}
      {wizard.step === "report" && <TranslateReportStep report={wizard.report} />}
    </WizardShell>
  );
}
