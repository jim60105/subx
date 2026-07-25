import { useCallback, useEffect, useRef, useState } from "react";

import type {
  SyncApplyResultDto,
  SyncDefaultsDto,
  SyncDetectionDto,
  SyncMethodDto,
} from "../../types/ipc";
import { isErrorDto } from "../../types/ipc";
import {
  applySyncOffset,
  cancelSyncDetection,
  detectSyncOffset,
  getSyncDefaults,
} from "./syncWizardApi";

export type SyncStepId = "inputs" | "method" | "detect" | "apply";

/** Ordered step ids, used for the WizardShell indicator. */
export const SYNC_STEPS: readonly SyncStepId[] = ["inputs", "method", "detect", "apply"] as const;

export interface SyncWizard {
  step: SyncStepId;
  mediaPath: string | null;
  subtitlePath: string | null;
  /** `null` until the shared configuration has been read. */
  defaults: SyncDefaultsDto | null;
  defaultsError: unknown;
  method: SyncMethodDto;
  /** Per-run VAD sensitivity as a whole percentage; `null` until the shared
   * configuration has been read. */
  sensitivity: number | null;
  /** The value that will be applied: entered in manual mode, detected and then
   * editable in automatic mode. */
  offsetMs: number;
  /** True when `offsetMs` is beyond the configured maximum. */
  offsetExceedsMax: boolean;
  /** Automatic detection needs a media file; manual never does. */
  canDetect: boolean;
  isDetecting: boolean;
  detection: SyncDetectionDto | null;
  detectError: unknown;
  /** The output path the user chose, or `null` to let the backend default it. */
  outputPath: string | null;
  /** What the output field shows: the chosen path, or the proposed default. */
  proposedOutputPath: string;
  isApplying: boolean;
  applyResult: SyncApplyResultDto | null;
  applyError: unknown;
  /** True once an apply was refused because its target already exists.
   * Confirming retries against exactly that target, never the live field. */
  canConfirmOverwrite: boolean;
  setMediaPath: (path: string | null) => void;
  setSubtitlePath: (path: string | null) => void;
  setMethod: (method: SyncMethodDto) => void;
  setSensitivity: (sensitivity: number) => void;
  setOffsetMs: (offsetMs: number) => void;
  setOutputPath: (path: string) => void;
  toMethod: () => void;
  backToInputs: () => void;
  toDetect: () => void;
  backToMethod: () => void;
  toApply: () => void;
  backToDetect: () => void;
  apply: () => Promise<void>;
  /** Re-runs the refused apply with the overwrite confirmed (design D5). */
  confirmOverwrite: () => Promise<void>;
  /** Discards everything and returns to Step 1. */
  restart: () => void;
}

/**
 * The default output path, mirroring the crate's `create_default_output_path`.
 *
 * Display only — the backend recomputes it with the crate's own function when
 * no explicit path is sent, so a drift between the two shows up as a visibly
 * wrong proposal rather than as a file written somewhere unexpected. An
 * extensionless path has no `_synced` name to build, and the crate returns the
 * input unchanged; the backend refuses that rather than writing in place.
 */
export function defaultOutputPath(subtitlePath: string): string {
  const separator = subtitlePath.lastIndexOf("/") > subtitlePath.lastIndexOf("\\") ? "/" : "\\";
  const cut = subtitlePath.lastIndexOf(separator);
  const directory = cut === -1 ? "" : subtitlePath.slice(0, cut + 1);
  const name = subtitlePath.slice(cut + 1);
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return subtitlePath;
  return `${directory}${name.slice(0, dot)}_synced${name.slice(dot)}`;
}

/**
 * The sync wizard's state machine.
 *
 * Owns every piece of wizard state and the backend calls; the step components
 * are presentational. Nothing is held backend-side between detection and apply
 * (design D1) — what travels is a single number, which is why `offsetMs` is
 * both what detection writes and what the review step edits.
 */
export function useSyncWizard(): SyncWizard {
  const [step, setStep] = useState<SyncStepId>("inputs");
  const [mediaPath, setMediaPath] = useState<string | null>(null);
  const [subtitlePath, setSubtitlePath] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<SyncDefaultsDto | null>(null);
  const [defaultsError, setDefaultsError] = useState<unknown>(undefined);
  const [method, setMethodState] = useState<SyncMethodDto>("auto");
  const [sensitivity, setSensitivityState] = useState<number | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [isDetecting, setIsDetecting] = useState(false);
  const [detection, setDetection] = useState<SyncDetectionDto | null>(null);
  const [detectError, setDetectError] = useState<unknown>(undefined);
  const [outputPath, setOutputPathState] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);
  const [applyResult, setApplyResult] = useState<SyncApplyResultDto | null>(null);
  const [applyError, setApplyError] = useState<unknown>(undefined);
  // The exact target a `sync.output_exists` rejection named, held separately
  // from `outputPath` so confirming an overwrite can only ever replace the file
  // the user was warned about — see `runApply`. Wrapped rather than stored bare
  // because `null` is itself a valid target, meaning "the default `_synced`
  // name": the wrapper is what distinguishes "no refusal pending" from "a
  // refusal for the defaulted path".
  const [pendingOverwrite, setPendingOverwrite] = useState<{ target: string | null } | null>(
    null,
  );

  // Identifies the in-flight detection. Only the newest may apply its result —
  // the frontend half of the backend's epoch guard (design D2).
  const detectionGenRef = useRef(0);

  // The configuration seeds Step 2's controls and the offset limit Step 2 and
  // Step 3 both validate against, so it is read once for the screen's life.
  useEffect(() => {
    let cancelled = false;
    void getSyncDefaults().then(
      (result) => {
        if (cancelled) return;
        setDefaults(result);
        setMethodState(result.defaultMethod);
      },
      (error: unknown) => {
        if (!cancelled) setDefaultsError(error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const setMethod = useCallback((next: SyncMethodDto) => {
    setMethodState(next);
    // A detection belongs to the method that produced it.
    setDetection(null);
    setDetectError(undefined);
  }, []);

  const setSensitivity = useCallback((next: number) => {
    setSensitivityState(next);
  }, []);

  const setOutputPath = useCallback((path: string) => {
    setOutputPathState(path);
    // Editing the target retracts any refusal it earned, which is what removes
    // the confirm button: a new path has to earn its own existence check rather
    // than inherit permission to overwrite from the old one.
    setApplyError(undefined);
    setPendingOverwrite(null);
  }, []);

  const toMethod = useCallback(() => {
    setStep("method");
  }, []);

  const backToInputs = useCallback(() => {
    setStep("inputs");
  }, []);

  const runDetection = useCallback(async () => {
    if (mediaPath === null || subtitlePath === null) return;
    const generation = ++detectionGenRef.current;
    const isCurrent = () => generation === detectionGenRef.current;

    setIsDetecting(true);
    setDetection(null);
    setDetectError(undefined);
    try {
      const result = await detectSyncOffset(mediaPath, subtitlePath, sensitivity);
      if (!isCurrent()) return;
      setDetection(result);
      setOffsetMs(result.offsetMs);
    } catch (error) {
      if (!isCurrent()) return;
      setDetectError(error);
    } finally {
      if (isCurrent()) setIsDetecting(false);
    }
  }, [mediaPath, subtitlePath, sensitivity]);

  const toDetect = useCallback(() => {
    setStep("detect");
    // Manual mode has nothing to detect: the entered value goes straight to
    // review, which is the same editable field the detected one lands in.
    if (method === "auto") void runDetection();
  }, [method, runDetection]);

  const backToMethod = useCallback(() => {
    // Bumping the ref stops a late *response* from reaching React state, but
    // the backend keeps running the invocation the user abandoned — Tauri does
    // not cancel a command just because nobody awaits it. `cancel_sync_detection`
    // aborts the task and bumps the backend epoch, which is what guarantees a
    // cancelled detection never surfaces a result (design D2).
    void cancelSyncDetection();
    detectionGenRef.current += 1;
    setIsDetecting(false);
    setDetection(null);
    setDetectError(undefined);
    setStep("method");
  }, []);

  const toApply = useCallback(() => {
    setApplyResult(null);
    setApplyError(undefined);
    setPendingOverwrite(null);
    setStep("apply");
  }, []);

  const backToDetect = useCallback(() => {
    setApplyResult(null);
    setApplyError(undefined);
    setPendingOverwrite(null);
    setStep("detect");
  }, []);

  const runApply = useCallback(
    async (target: string | null, overwrite: boolean) => {
      if (subtitlePath === null) return;
      setIsApplying(true);
      setApplyError(undefined);
      try {
        setApplyResult(await applySyncOffset(subtitlePath, offsetMs, target, overwrite));
        setPendingOverwrite(null);
      } catch (error) {
        setApplyError(error);
        // Remember what was refused, not what the field says: the field stays
        // editable, and a confirmation must not become permission to replace a
        // different file that was never checked for existence.
        setPendingOverwrite(
          isErrorDto(error) && error.code === "sync.output_exists" ? { target } : null,
        );
      } finally {
        setIsApplying(false);
      }
    },
    [subtitlePath, offsetMs],
  );

  const apply = useCallback(() => runApply(outputPath, false), [runApply, outputPath]);
  const confirmOverwrite = useCallback(
    () => runApply(pendingOverwrite?.target ?? null, true),
    [runApply, pendingOverwrite],
  );

  const restart = useCallback(() => {
    setPendingOverwrite(null);
    void cancelSyncDetection();
    detectionGenRef.current += 1;
    setMediaPath(null);
    setSubtitlePath(null);
    setOffsetMs(0);
    setIsDetecting(false);
    setDetection(null);
    setDetectError(undefined);
    setOutputPathState(null);
    setApplyResult(null);
    setApplyError(undefined);
    setStep("inputs");
  }, []);

  const canDetect = subtitlePath !== null && (method === "manual" || mediaPath !== null);
  const offsetExceedsMax =
    defaults !== null && Math.abs(offsetMs) > defaults.maxOffsetMs;

  return {
    step,
    mediaPath,
    subtitlePath,
    defaults,
    defaultsError,
    method,
    sensitivity: sensitivity ?? defaults?.vadSensitivity ?? null,
    offsetMs,
    offsetExceedsMax,
    canDetect,
    isDetecting,
    detection,
    detectError,
    outputPath,
    proposedOutputPath:
      outputPath ?? (subtitlePath === null ? "" : defaultOutputPath(subtitlePath)),
    isApplying,
    applyResult,
    applyError,
    canConfirmOverwrite: pendingOverwrite !== null,
    setMediaPath,
    setSubtitlePath,
    setMethod,
    setSensitivity,
    setOffsetMs,
    setOutputPath,
    toMethod,
    backToInputs,
    toDetect,
    backToMethod,
    toApply,
    backToDetect,
    apply,
    confirmOverwrite,
    restart,
  };
}
