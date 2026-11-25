import { useCallback, useEffect, useRef, useState } from "react";

import type { SyncApplyResultDto, SyncDefaultsDto, SyncDetectionDto } from "../../types/ipc";
import { isErrorDto } from "../../types/ipc";
import {
  applySyncOffset,
  cancelSyncDetection,
  detectSyncOffset,
  getSyncDefaults,
} from "./syncWizardApi";

export type SyncStepId = "inputs" | "detect" | "offset" | "apply";

/** The detect step's three states (design D1). */
export type DetectPhase = "ask" | "detecting" | "failed";

/** Ordered step ids, used for the WizardShell indicator. */
export const SYNC_STEPS: readonly SyncStepId[] = ["inputs", "detect", "offset", "apply"] as const;

export interface SyncWizard {
  step: SyncStepId;
  mediaPath: string | null;
  subtitlePath: string | null;
  /** Automatic detection needs a media file to listen to. */
  hasMedia: boolean;
  /** `null` until the shared configuration has been read. */
  defaults: SyncDefaultsDto | null;
  defaultsError: unknown;
  /** `sync.default_method = manual`: skipping is the primary choice. */
  prefersManual: boolean;
  /** Per-run VAD sensitivity as a whole percentage; `null` until the shared
   * configuration has been read. */
  sensitivity: number | null;
  /** The value that will be applied: detected or zero, then edited on the
   * offset step. */
  offsetMs: number;
  /** True when `offsetMs` is beyond the configured maximum. */
  offsetExceedsMax: boolean;
  /** True once the offset step has been entered for the current files, which
   * is what makes keeping the current offset a choice on the detect step. */
  hasReview: boolean;
  detectPhase: DetectPhase;
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
  /** Selecting a different file resets the offset and the detection. */
  setMediaPath: (path: string | null) => void;
  setSubtitlePath: (path: string | null) => void;
  setSensitivity: (sensitivity: number) => void;
  setOffsetMs: (offsetMs: number) => void;
  setOutputPath: (path: string) => void;
  /** Files → detect, in the ask state. */
  toDetect: () => void;
  backToInputs: () => void;
  /** Ask or failed → detecting. Keeps the offset until a result arrives. */
  startDetection: () => void;
  /** Detecting → ask; a late result is discarded. */
  cancelDetection: () => void;
  /** Ask or failed → offset, with offset 0 and no detection. */
  skipDetection: () => void;
  /** Ask or failed → offset, with the offset and detection kept. */
  keepOffset: () => void;
  /** Offset → detect, in the ask state; the offset and detection are kept. */
  backToDetect: () => void;
  toApply: () => void;
  /** Save → offset. */
  backToOffset: () => void;
  apply: () => Promise<void>;
  /** Re-runs the refused apply with the overwrite confirmed (design D5). */
  confirmOverwrite: () => Promise<void>;
  /** Discards everything and returns to Step 1. */
  restart: () => void;
}

/**
 * Asks the backend to abort the running detection, never rejecting.
 *
 * The returned promise is what the next detection waits for, so a cancel still
 * in flight cannot abort the run that follows it.
 */
function cancelQuietly(): Promise<void> {
  try {
    return Promise.resolve(cancelSyncDetection()).catch(() => undefined);
  } catch {
    return Promise.resolve();
  }
}

/**
 * The most recent cancel request, shared by every wizard instance: a run
 * started from a freshly mounted wizard must still wait for the cancel the
 * previous one sent on its way out.
 */
let pendingCancel: Promise<void> = Promise.resolve();

/** Test isolation only: forgets a cancel left pending by an earlier test. */
export function resetPendingCancelForTests(): void {
  pendingCancel = Promise.resolve();
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
 * both what detection writes and what the offset step edits.
 */
export function useSyncWizard(): SyncWizard {
  const [step, setStep] = useState<SyncStepId>("inputs");
  const [mediaPath, setMediaPathState] = useState<string | null>(null);
  const [subtitlePath, setSubtitlePathState] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<SyncDefaultsDto | null>(null);
  const [defaultsError, setDefaultsError] = useState<unknown>(undefined);
  const [sensitivity, setSensitivityState] = useState<number | null>(null);
  const [offsetMs, setOffsetMs] = useState(0);
  const [hasReview, setHasReview] = useState(false);
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
  // Mirrors `isDetecting` synchronously, so a second Start that lands before
  // the re-render cannot send a request the backend would refuse as
  // `sync.detection_in_progress`.
  const detectingRef = useRef(false);
  // The selected paths, read synchronously by the setters: one drop may set
  // both slots in a single tick, and the setters stay identity-stable for the
  // drop subscription that calls them.
  const mediaRef = useRef<string | null>(null);
  const subtitleRef = useRef<string | null>(null);

  // The configuration seeds Step 2's controls and the offset limit Step 3
  // validates against, so it is read once for the screen's life.
  useEffect(() => {
    let cancelled = false;
    void getSyncDefaults().then(
      (result) => {
        if (!cancelled) setDefaults(result);
      },
      (error: unknown) => {
        if (!cancelled) setDefaultsError(error);
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Leaving the screen mid-run abandons the detection exactly as Cancel does;
  // the late result is dropped by the generation bump. Nothing is set in
  // React state: the component is going away. A run still waiting on the
  // previous cancel also counts as running; its extra cancel is harmless.
  useEffect(
    () => () => {
      if (!detectingRef.current) return;
      pendingCancel = cancelQuietly();
      detectionGenRef.current += 1;
      detectingRef.current = false;
    },
    [],
  );

  // A detection and an offset belong to the pair that produced them.
  const resetReview = useCallback(() => {
    setOffsetMs(0);
    setDetection(null);
    setDetectError(undefined);
    setHasReview(false);
  }, []);

  const setMediaPath = useCallback(
    (path: string | null) => {
      if (path === mediaRef.current) return;
      mediaRef.current = path;
      setMediaPathState(path);
      resetReview();
    },
    [resetReview],
  );

  const setSubtitlePath = useCallback(
    (path: string | null) => {
      if (path === subtitleRef.current) return;
      subtitleRef.current = path;
      setSubtitlePathState(path);
      resetReview();
    },
    [resetReview],
  );

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

  const toDetect = useCallback(() => {
    setDetectError(undefined);
    setStep("detect");
  }, []);

  const backToInputs = useCallback(() => {
    setDetectError(undefined);
    setStep("inputs");
  }, []);

  const stopDetecting = useCallback(() => {
    detectingRef.current = false;
    setIsDetecting(false);
  }, []);

  const runDetection = useCallback(async () => {
    if (mediaPath === null || subtitlePath === null || detectingRef.current) return;
    const generation = ++detectionGenRef.current;
    const isCurrent = () => generation === detectionGenRef.current;

    // The offset and any earlier detection stay until a result replaces them:
    // a failed or cancelled run leaves the review as it was.
    detectingRef.current = true;
    setIsDetecting(true);
    setDetectError(undefined);
    await pendingCancel;
    // Whoever made this run stale (cancel, restart) has already cleared the
    // detecting state.
    if (!isCurrent()) return;
    try {
      const result = await detectSyncOffset(mediaPath, subtitlePath, sensitivity);
      if (!isCurrent()) return;
      setDetection(result);
      setOffsetMs(result.offsetMs);
      setHasReview(true);
      setStep("offset");
    } catch (error) {
      if (!isCurrent()) return;
      setDetectError(error);
    } finally {
      if (isCurrent()) stopDetecting();
    }
  }, [mediaPath, subtitlePath, sensitivity, stopDetecting]);

  const startDetection = useCallback(() => {
    void runDetection();
  }, [runDetection]);

  const cancelDetection = useCallback(() => {
    // Bumping the ref stops a late *response* from reaching React state, but
    // the backend keeps running the invocation the user abandoned — Tauri does
    // not cancel a command just because nobody awaits it. `cancel_sync_detection`
    // aborts the task and bumps the backend epoch, which is what guarantees a
    // cancelled detection never surfaces a result (design D2).
    pendingCancel = cancelQuietly();
    detectionGenRef.current += 1;
    stopDetecting();
    setDetectError(undefined);
  }, [stopDetecting]);

  const skipDetection = useCallback(() => {
    setOffsetMs(0);
    setDetection(null);
    setDetectError(undefined);
    setHasReview(true);
    setStep("offset");
  }, []);

  const keepOffset = useCallback(() => {
    setDetectError(undefined);
    setHasReview(true);
    setStep("offset");
  }, []);

  const backToDetect = useCallback(() => {
    setDetectError(undefined);
    setStep("detect");
  }, []);

  const toApply = useCallback(() => {
    setApplyResult(null);
    setApplyError(undefined);
    setPendingOverwrite(null);
    setStep("apply");
  }, []);

  const backToOffset = useCallback(() => {
    setApplyResult(null);
    setApplyError(undefined);
    setPendingOverwrite(null);
    setStep("offset");
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
    pendingCancel = cancelQuietly();
    detectionGenRef.current += 1;
    stopDetecting();
    mediaRef.current = null;
    subtitleRef.current = null;
    setMediaPathState(null);
    setSubtitlePathState(null);
    resetReview();
    setOutputPathState(null);
    setApplyResult(null);
    setApplyError(undefined);
    setStep("inputs");
  }, [resetReview, stopDetecting]);

  const offsetExceedsMax =
    defaults !== null && Math.abs(offsetMs) > defaults.maxOffsetMs;
  const detectPhase: DetectPhase = isDetecting
    ? "detecting"
    : detectError !== undefined
      ? "failed"
      : "ask";

  return {
    step,
    mediaPath,
    subtitlePath,
    hasMedia: mediaPath !== null,
    defaults,
    defaultsError,
    prefersManual: defaults?.defaultMethod === "manual",
    sensitivity: sensitivity ?? defaults?.vadSensitivity ?? null,
    offsetMs,
    offsetExceedsMax,
    hasReview,
    detectPhase,
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
    setSensitivity,
    setOffsetMs,
    setOutputPath,
    toDetect,
    backToInputs,
    startDetection,
    cancelDetection,
    skipDetection,
    keepOffset,
    backToDetect,
    toApply,
    backToOffset,
    apply,
    confirmOverwrite,
    restart,
  };
}
