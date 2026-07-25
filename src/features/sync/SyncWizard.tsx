import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { WizardShell } from "../../components/WizardShell/WizardShell";
import type { WizardStep } from "../../components/WizardShell/WizardShell";
import { pickFile, subscribeToDroppedPaths } from "../../platform/filePickers";
import { SyncApplyStep } from "./SyncApplyStep";
import { SyncDetectStep } from "./SyncDetectStep";
import { SyncInputsStep } from "./SyncInputsStep";
import { SyncMethodStep } from "./SyncMethodStep";
import { SYNC_STEPS, useSyncWizard } from "./useSyncWizard";

interface NavAction {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

/**
 * Extensions the crate reads as subtitles.
 *
 * Used only to route a dropped file into the right slot. Getting it wrong is
 * recoverable — the user can re-pick either slot — so this deliberately does not
 * try to enumerate every media container: anything that is not a subtitle is
 * offered as the media file, and the backend is what ultimately refuses a file
 * it cannot read.
 */
const SUBTITLE_EXTENSIONS = ["srt", "ass", "ssa", "vtt", "sub", "smi", "lrc"];

function isSubtitlePath(path: string): boolean {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return SUBTITLE_EXTENSIONS.includes(extension);
}

/**
 * The four-step sync wizard on `WizardShell`.
 *
 * All state lives in `useSyncWizard`; this component wires that state to the
 * shell's navigation and to the presentational step components, and subscribes
 * to window file drops.
 */
export function SyncWizard() {
  const { t } = useTranslation("sync");
  const wizard = useSyncWizard();
  const { setMediaPath, setSubtitlePath } = wizard;

  // Window-level OS file drops fill whichever slot the extension implies.
  const acceptDroppedPaths = useCallback(
    (paths: string[]) => {
      for (const path of paths) {
        if (isSubtitlePath(path)) setSubtitlePath(path);
        else setMediaPath(path);
      }
    },
    [setMediaPath, setSubtitlePath],
  );

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let cancelled = false;
    void subscribeToDroppedPaths(acceptDroppedPaths).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [acceptDroppedPaths]);

  const steps: WizardStep[] = SYNC_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }));
  const activeStep = SYNC_STEPS.indexOf(wizard.step);

  let back: NavAction | undefined;
  let next: NavAction | undefined;
  if (wizard.step === "inputs") {
    next = {
      label: t("inputs.continue"),
      disabled: wizard.subtitlePath === null,
      onClick: wizard.toMethod,
    };
  } else if (wizard.step === "method") {
    back = { label: t("method.back"), onClick: wizard.backToInputs };
    next = {
      label: t("method.continue"),
      disabled: !wizard.canDetect || wizard.offsetExceedsMax,
      onClick: wizard.toDetect,
    };
  } else if (wizard.step === "detect") {
    // Going back abandons the detection rather than leaving it running behind
    // the user; the wizard re-runs it if they come forward again.
    back = { label: t("detect.back"), onClick: wizard.backToMethod };
    next = {
      label: t("detect.continue"),
      disabled:
        wizard.isDetecting ||
        wizard.offsetExceedsMax ||
        (wizard.method === "auto" && wizard.detection === null),
      onClick: wizard.toApply,
    };
  } else if (wizard.applyResult === null) {
    back = { label: t("apply.back"), disabled: wizard.isApplying, onClick: wizard.backToDetect };
  }

  return (
    <WizardShell steps={steps} activeStep={activeStep} back={back} next={next}>
      {wizard.step === "inputs" && (
        <SyncInputsStep
          mediaPath={wizard.mediaPath}
          subtitlePath={wizard.subtitlePath}
          onBrowseMedia={() => void pickFile().then((path) => path && setMediaPath(path))}
          onBrowseSubtitle={() => void pickFile().then((path) => path && setSubtitlePath(path))}
          onClearMedia={() => setMediaPath(null)}
          onClearSubtitle={() => setSubtitlePath(null)}
        />
      )}
      {wizard.step === "method" && (
        <SyncMethodStep
          method={wizard.method}
          hasMedia={wizard.mediaPath !== null}
          defaults={wizard.defaults}
          defaultsError={wizard.defaultsError}
          sensitivity={wizard.sensitivity}
          offsetMs={wizard.offsetMs}
          offsetExceedsMax={wizard.offsetExceedsMax}
          onMethodChange={wizard.setMethod}
          onSensitivityChange={wizard.setSensitivity}
          onOffsetChange={wizard.setOffsetMs}
        />
      )}
      {wizard.step === "detect" && (
        <SyncDetectStep
          method={wizard.method}
          defaults={wizard.defaults}
          isDetecting={wizard.isDetecting}
          detection={wizard.detection}
          detectError={wizard.detectError}
          offsetMs={wizard.offsetMs}
          offsetExceedsMax={wizard.offsetExceedsMax}
          onOffsetChange={wizard.setOffsetMs}
          onCancel={wizard.backToMethod}
          onRetry={wizard.toDetect}
        />
      )}
      {wizard.step === "apply" && (
        <SyncApplyStep
          offsetMs={wizard.offsetMs}
          outputPath={wizard.proposedOutputPath}
          isApplying={wizard.isApplying}
          applyResult={wizard.applyResult}
          applyError={wizard.applyError}
          canConfirmOverwrite={wizard.canConfirmOverwrite}
          onOutputPathChange={wizard.setOutputPath}
          onApply={() => void wizard.apply()}
          onConfirmOverwrite={() => void wizard.confirmOverwrite()}
          onRestart={wizard.restart}
        />
      )}
    </WizardShell>
  );
}
