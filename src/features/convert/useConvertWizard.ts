import { useCallback, useRef, useState } from "react";

import type {
  ConversionReportDto,
  ConvertFormatDto,
  ConvertPlanDto,
  ConvertProgress,
  ConvertScanResult,
} from "../../types/ipc";
import {
  cancelConversion,
  executeConversion,
  previewConversion,
  scanConvertInputs,
} from "./convertWizardApi";

export type ConvertStepId = "sources" | "options" | "run";

/** Ordered step ids, used for the WizardShell indicator. */
export const CONVERT_STEPS: readonly ConvertStepId[] = ["sources", "options", "run"] as const;

export interface ConvertWizard {
  step: ConvertStepId;
  sources: string[];
  scan: ConvertScanResult | null;
  isScanning: boolean;
  scanError: unknown;
  /** True once a scan proves the sources hold at least one subtitle. */
  canPreview: boolean;
  /** `null` until the first plan reports what the configuration chose. */
  targetFormat: ConvertFormatDto | null;
  keepOriginal: boolean;
  plan: ConvertPlanDto | null;
  isPreviewing: boolean;
  previewError: unknown;
  selectedIds: Set<number>;
  selectedCount: number;
  isConverting: boolean;
  progress: ConvertProgress | null;
  report: ConversionReportDto | null;
  convertError: unknown;
  addSources: (paths: string[]) => void;
  removeSource: (path: string) => void;
  toOptions: () => void;
  setTargetFormat: (format: ConvertFormatDto) => void;
  setKeepOriginal: (keepOriginal: boolean) => void;
  toggleSelection: (id: number) => void;
  toRun: () => void;
  convert: () => Promise<void>;
  cancel: () => Promise<void>;
  /** Discards the plan and returns to Step 1 (back past the preview). */
  restart: () => void;
}

/** The items a plan actually allows to run — everything else is excluded. */
function runnableIds(plan: ConvertPlanDto): number[] {
  return plan.items.filter((item) => item.skipReason === null).map((item) => item.id);
}

/**
 * The convert wizard's state machine.
 *
 * Owns every piece of wizard state and the backend calls; the step components
 * are presentational. The canonical plan lives in the backend — this holds only
 * the display DTO and the set of selected item ids.
 */
export function useConvertWizard(): ConvertWizard {
  const [step, setStep] = useState<ConvertStepId>("sources");
  const [sources, setSources] = useState<string[]>([]);
  const [scan, setScan] = useState<ConvertScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<unknown>(undefined);
  const [targetFormat, setTargetFormatState] = useState<ConvertFormatDto | null>(null);
  const [keepOriginal, setKeepOriginalState] = useState(true);
  const [plan, setPlan] = useState<ConvertPlanDto | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<unknown>(undefined);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isConverting, setIsConverting] = useState(false);
  const [progress, setProgress] = useState<ConvertProgress | null>(null);
  const [report, setReport] = useState<ConversionReportDto | null>(null);
  const [convertError, setConvertError] = useState<unknown>(undefined);

  // Identifies the in-flight preview. Changing the format or the keep-original
  // toggle starts a new one, and only the newest may apply its result.
  const previewGenRef = useRef(0);

  const rescan = useCallback(async (next: string[]) => {
    if (next.length === 0) {
      setScan(null);
      setScanError(undefined);
      return;
    }
    setIsScanning(true);
    setScanError(undefined);
    try {
      setScan(await scanConvertInputs(next));
    } catch (error) {
      setScan(null);
      setScanError(error);
    } finally {
      setIsScanning(false);
    }
  }, []);

  const addSources = useCallback(
    (paths: string[]) => {
      setSources((current) => {
        const merged = [...current];
        for (const path of paths) {
          if (!merged.includes(path)) merged.push(path);
        }
        void rescan(merged);
        return merged;
      });
    },
    [rescan],
  );

  const removeSource = useCallback(
    (path: string) => {
      setSources((current) => {
        const next = current.filter((entry) => entry !== path);
        void rescan(next);
        return next;
      });
    },
    [rescan],
  );

  const refreshPreview = useCallback(
    async (format: ConvertFormatDto | null, keep: boolean) => {
      const generation = ++previewGenRef.current;
      const isCurrent = () => generation === previewGenRef.current;
      setIsPreviewing(true);
      setPreviewError(undefined);
      try {
        // A null format asks the backend for the configured default, which it
        // then echoes back on the plan — that is how the select is preselected.
        const result = await previewConversion(sources, {
          targetFormat: format,
          keepOriginal: keep,
        });
        if (!isCurrent()) return;
        setPlan(result);
        setTargetFormatState(result.targetFormat);
        setSelectedIds(new Set(runnableIds(result)));
      } catch (error) {
        if (!isCurrent()) return;
        setPlan(null);
        setPreviewError(error);
      } finally {
        if (isCurrent()) setIsPreviewing(false);
      }
    },
    [sources],
  );

  const toOptions = useCallback(() => {
    setStep("options");
    void refreshPreview(targetFormat, keepOriginal);
  }, [refreshPreview, targetFormat, keepOriginal]);

  const setTargetFormat = useCallback(
    (format: ConvertFormatDto) => {
      setTargetFormatState(format);
      void refreshPreview(format, keepOriginal);
    },
    [refreshPreview, keepOriginal],
  );

  const setKeepOriginal = useCallback(
    (next: boolean) => {
      setKeepOriginalState(next);
      // Re-previewed rather than sent at execution time: keep-original is part
      // of the plan the user authorizes, not a switch flipped afterwards.
      void refreshPreview(targetFormat, next);
    },
    [refreshPreview, targetFormat],
  );

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toRun = useCallback(() => {
    setProgress(null);
    setReport(null);
    setConvertError(undefined);
    setStep("run");
  }, []);

  const restart = useCallback(() => {
    // Bumping the local ref stops a late preview *response* from reaching React
    // state, but the backend keeps running the invocation the user abandoned —
    // Tauri does not cancel a command just because nobody awaits it. Without
    // this call a slow preview (a large archive) could still `commit_plan`
    // after a newer, faster one, silently replacing the plan the user is now
    // acting on and bouncing execution with a spurious `convert.stale_plan`.
    // `cancel_conversion` bumps the backend epoch, so any in-flight preview
    // fails its commit; it is a no-op for a batch (none runs while a Back or
    // Finish is reachable), and mints a fresh cancel flag either way.
    void cancelConversion();
    previewGenRef.current += 1;
    setPlan(null);
    setSelectedIds(new Set());
    setProgress(null);
    setReport(null);
    setConvertError(undefined);
    setPreviewError(undefined);
    setIsPreviewing(false);
    setStep("sources");
  }, []);

  const convert = useCallback(async () => {
    if (plan === null) return;
    setIsConverting(true);
    setConvertError(undefined);
    try {
      setReport(await executeConversion(plan.planId, [...selectedIds], setProgress));
    } catch (error) {
      setConvertError(error);
    } finally {
      setIsConverting(false);
    }
  }, [plan, selectedIds]);

  const cancel = useCallback(async () => {
    // The batch stops between files and still resolves with its report, so
    // there is nothing to discard here — only a request to stop.
    await cancelConversion();
  }, []);

  const canPreview =
    sources.length > 0 && !isScanning && scan !== null && scan.subtitleCount > 0;

  return {
    step,
    sources,
    scan,
    isScanning,
    scanError,
    canPreview,
    targetFormat,
    keepOriginal,
    plan,
    isPreviewing,
    previewError,
    selectedIds,
    selectedCount: selectedIds.size,
    isConverting,
    progress,
    report,
    convertError,
    addSources,
    removeSource,
    toOptions,
    setTargetFormat,
    setKeepOriginal,
    toggleSelection,
    toRun,
    convert,
    cancel,
    restart,
  };
}
