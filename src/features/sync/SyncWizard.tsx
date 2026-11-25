import { useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";

import { WizardShell } from "../../components/WizardShell/WizardShell";
import type { WizardNavAction, WizardStep } from "../../components/WizardShell/WizardShell";
import { pickFile, subscribeToDroppedPaths } from "../../platform/filePickers";
import { formatSeconds } from "./OffsetField";
import { SyncApplyStep } from "./SyncApplyStep";
import { SyncDetectStep } from "./SyncDetectStep";
import { SyncInputsStep } from "./SyncInputsStep";
import { SyncOffsetStep } from "./SyncOffsetStep";
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
 * to window file drops while the files step is shown.
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

  // Drops are accepted on the files step only: anywhere later, a stray drop
  // would silently replace a file and with it the offset under review.
  const onFilesStep = wizard.step === "inputs";
  useEffect(() => {
    if (!onFilesStep) return;
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
  }, [onFilesStep, acceptDroppedPaths]);

  const steps: WizardStep[] = SYNC_STEPS.map((id) => ({ id, label: t(`steps.${id}`) }));
  const activeStep = SYNC_STEPS.indexOf(wizard.step);

  // Every action the wizard offers, on every step, lives in the shell's bar so
  // the primary control never moves; the step components only render state.
  let back: WizardNavAction | undefined;
  let secondary: WizardNavAction | readonly [WizardNavAction, WizardNavAction] | undefined;
  let next: WizardNavAction | undefined;
  if (wizard.step === "inputs") {
    next = {
      label: t("inputs.continue"),
      disabled: wizard.subtitlePath === null,
      onClick: wizard.toDetect,
    };
  } else if (wizard.step === "detect") {
    const skip: WizardNavAction = { label: t("detect.skip"), onClick: wizard.skipDetection };
    const start: WizardNavAction = { label: t("detect.start"), onClick: wizard.startDetection };
    // The figure rounds to 10 ms; the accessible name carries the exact value.
    const offset = formatSeconds(wizard.offsetMs);
    const keep: WizardNavAction = {
      label: t("detect.keep", { offset }),
      accessibleLabel: t("detect.keepLabel", {
        offset,
        seconds: (wizard.offsetMs / 1000).toFixed(3),
      }),
      onClick: wizard.keepOffset,
    };
    if (wizard.detectPhase === "detecting") {
      // The primary position stays occupied, disabled, for the whole run.
      secondary = { label: t("detect.cancel"), onClick: wizard.cancelDetection };
      next = { label: t("detect.detecting"), disabled: true };
    } else {
      back = { label: t("detect.back"), onClick: wizard.backToInputs };
      if (wizard.detectPhase === "failed") {
        next = { label: t("detect.retry"), onClick: wizard.startDetection };
        secondary = wizard.hasReview ? [skip, keep] : skip;
      } else if (wizard.hasReview) {
        // Keeping is the only choice that discards nothing, so it is primary.
        next = keep;
        secondary = wizard.hasMedia ? [skip, start] : skip;
      } else if (!wizard.hasMedia) {
        next = skip;
      } else if (wizard.prefersManual) {
        next = skip;
        secondary = start;
      } else {
        next = start;
        secondary = skip;
      }
    }
  } else if (wizard.step === "offset") {
    back = { label: t("offset.back"), onClick: wizard.backToDetect };
    next = {
      label: t("offset.continue"),
      disabled: wizard.offsetExceedsMax,
      onClick: wizard.toApply,
    };
  } else if (wizard.applyResult !== null) {
    next = { label: t("apply.report.finish"), onClick: wizard.restart };
  } else {
    back = { label: t("apply.back"), disabled: wizard.isApplying, onClick: wizard.backToOffset };
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
      {wizard.step === "detect" && (
        <SyncDetectStep
          phase={wizard.detectPhase}
          hasMedia={wizard.hasMedia}
          defaults={wizard.defaults}
          defaultsError={wizard.defaultsError}
          sensitivity={wizard.sensitivity}
          detectError={wizard.detectError}
          onSensitivityChange={wizard.setSensitivity}
        />
      )}
      {wizard.step === "offset" && (
        <SyncOffsetStep
          defaults={wizard.defaults}
          detection={wizard.detection}
          offsetMs={wizard.offsetMs}
          offsetExceedsMax={wizard.offsetExceedsMax}
          onOffsetChange={wizard.setOffsetMs}
        />
      )}
      {wizard.step === "apply" && (
        <SyncApplyStep
          offsetMs={wizard.offsetMs}
          subtitlePath={wizard.subtitlePath}
          outputPath={wizard.proposedOutputPath}
          applyResult={wizard.applyResult}
          applyError={wizard.applyError}
          onOutputPathChange={wizard.setOutputPath}
        />
      )}
    </WizardShell>
  );
}
