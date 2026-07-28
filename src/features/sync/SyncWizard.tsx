import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { WizardShell } from "../../components/WizardShell/WizardShell";
import type { WizardNavAction, WizardStep } from "../../components/WizardShell/WizardShell";
import { pickFile, subscribeToDroppedPaths } from "../../platform/filePickers";
import { SyncApplyStep } from "./SyncApplyStep";
import { SyncDetectStep } from "./SyncDetectStep";
import { SyncInputsStep } from "./SyncInputsStep";
import { SyncMethodStep } from "./SyncMethodStep";
import { SYNC_STEPS, useSyncWizard } from "./useSyncWizard";

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

  // Every action the wizard offers, on every step, lives in the shell's bar so
  // the primary control never moves; the step components only render state.
  let back: WizardNavAction | undefined;
  let secondary: WizardNavAction | undefined;
  let next: WizardNavAction | undefined;
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
    // the user; it is this step's cancel as well as its retreat.
    back = { label: t("detect.back"), onClick: wizard.backToMethod };
    next =
      !wizard.isDetecting && wizard.detectError !== undefined
        ? { label: t("detect.retry"), onClick: wizard.toDetect }
        : {
            label: t("detect.continue"),
            // One formula for the whole step, not one per phase: manual mode
            // never produces a `detection`, and re-deriving this from
            // `detection !== null` would leave it with no way forward.
            disabled:
              wizard.isDetecting ||
              wizard.offsetExceedsMax ||
              (wizard.method === "auto" && wizard.detection === null),
            onClick: wizard.toApply,
          };
  } else if (wizard.applyResult !== null) {
    next = { label: t("apply.report.finish"), onClick: wizard.restart };
  } else {
    back = { label: t("apply.back"), disabled: wizard.isApplying, onClick: wizard.backToDetect };
    const save: WizardNavAction = {
      label: wizard.isApplying ? t("apply.applying") : t("apply.start"),
      disabled: wizard.isApplying,
      onClick: () => void wizard.apply(),
    };
    if (wizard.canConfirmOverwrite) {
      // A refused overwrite has two ways out: replace the file, or edit the
      // output path and save again. Replacing is the decisive move and takes
      // the primary slot; saving stands aside rather than disappearing.
      secondary = save;
      next = {
        label: t("apply.confirmOverwrite"),
        disabled: wizard.isApplying,
        onClick: () => void wizard.confirmOverwrite(),
      };
    } else {
      // Every other failure keeps `apply.start` as its retry — the output path
      // is still editable, which is what makes retrying meaningful.
      next = save;
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
        />
      )}
      {wizard.step === "apply" && (
        <SyncApplyStep
          offsetMs={wizard.offsetMs}
          outputPath={wizard.proposedOutputPath}
          applyResult={wizard.applyResult}
          applyError={wizard.applyError}
          onOutputPathChange={wizard.setOutputPath}
        />
      )}
    </WizardShell>
  );
}
