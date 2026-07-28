import { useCallback, useRef, useState } from "react";

import type {
  TranslateOutputModeDto,
  TranslatePlanDto,
  TranslateProgress,
  TranslateScanResult,
  TranslationReportDto,
} from "../../types/ipc";
import {
  cancelTranslation,
  executeTranslation,
  previewTranslation,
  scanTranslateInputs,
} from "./translateWizardApi";

export type TranslateStepId = "sources" | "options" | "translate" | "report";

/** Ordered step ids, used for the WizardShell indicator. */
export const TRANSLATE_STEPS: readonly TranslateStepId[] = [
  "sources",
  "options",
  "translate",
  "report",
] as const;

export interface TranslateWizard {
  step: TranslateStepId;
  sources: string[];
  /** Step 1's option-free cue-count preview of what the sources hold. */
  scan: TranslateScanResult | null;
  isScanning: boolean;
  scanError: unknown;
  /** The plan for the current options, built and reviewed on Step 2. */
  plan: TranslatePlanDto | null;
  isPreviewing: boolean;
  previewError: unknown;
  /** True once a scan proves the sources hold at least one subtitle. */
  canPreview: boolean;
  targetLanguage: string;
  sourceLanguage: string;
  context: string;
  glossaryText: string;
  outputMode: TranslateOutputModeDto;
  overwrite: boolean;
  selectedIds: Set<number>;
  selectedCount: number;
  isTranslating: boolean;
  progress: TranslateProgress | null;
  report: TranslationReportDto | null;
  translateError: unknown;
  addSources: (paths: string[]) => void;
  removeSource: (path: string) => void;
  toOptions: () => void;
  setTargetLanguage: (value: string) => void;
  setSourceLanguage: (value: string) => void;
  setContext: (value: string) => void;
  setGlossaryText: (value: string) => void;
  setOutputMode: (mode: TranslateOutputModeDto) => void;
  setOverwrite: (value: boolean) => void;
  toggleSelection: (id: number) => void;
  toTranslate: () => void;
  translate: () => Promise<void>;
  cancel: () => Promise<void>;
  /** Discards the plan and returns to Step 1 (back past the preview). */
  restart: () => void;
}

/** The items a plan actually allows to run — everything else is excluded. */
function runnableIds(plan: TranslatePlanDto): number[] {
  return plan.items.filter((item) => item.skipReason === null).map((item) => item.id);
}

/** Empty text fields travel as `null`, matching the DTO's "not set" shape. */
function orNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * The translate wizard's state machine.
 *
 * Owns every piece of wizard state and the backend calls; the step components
 * are presentational. The canonical plan lives in the backend — this holds
 * only the display DTO and the set of selected item ids.
 *
 * Sources and options are two separate backend calls, as in convert: Step 1
 * scans (`scanTranslateInputs`, options-free) and Step 2 plans
 * (`previewTranslation`, which needs the target language Step 2 is where the
 * user supplies). Once on Step 2, every option — including the free-text ones
 * — re-previews immediately: they are cheap, AI-free filesystem calls, and
 * re-previewing keeps the plan the user is about to authorize in sync with the
 * form.
 */
export function useTranslateWizard(): TranslateWizard {
  const [step, setStep] = useState<TranslateStepId>("sources");
  const [sources, setSources] = useState<string[]>([]);
  const [scan, setScan] = useState<TranslateScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<unknown>(undefined);
  const [plan, setPlan] = useState<TranslatePlanDto | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<unknown>(undefined);
  const [targetLanguage, setTargetLanguageState] = useState("");
  const [sourceLanguage, setSourceLanguageState] = useState("");
  const [context, setContextState] = useState("");
  const [glossaryText, setGlossaryTextState] = useState("");
  const [outputMode, setOutputModeState] = useState<TranslateOutputModeDto>("suffix");
  const [overwrite, setOverwriteState] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isTranslating, setIsTranslating] = useState(false);
  const [progress, setProgress] = useState<TranslateProgress | null>(null);
  const [report, setReport] = useState<TranslationReportDto | null>(null);
  const [translateError, setTranslateError] = useState<unknown>(undefined);

  // Identifies the in-flight preview. A restart invalidates it, and only the
  // newest response may apply to React state.
  const previewGenRef = useRef(0);
  // Every option field re-previews immediately, including free-text ones —
  // there is no debounce, since `preview_translation` is a cheap, AI-free
  // filesystem call. But two `preview_translation` calls in flight at once
  // could resolve out of order, and the backend's single-plan slot has no
  // concept of "this commit is older than one already applied" (unlike the
  // generation counter here, which only protects *this* component's state):
  // an older call finishing after a newer one would silently become the
  // backend's active plan while the UI still shows the newer one, and
  // `execute_translation` would then fail with a spurious `stale_plan`. So at
  // most one `preview_translation` call is ever in flight; a change that
  // arrives while one is running replaces the single pending slot rather than
  // firing concurrently, which keeps every call resolving in the order it was
  // sent and guarantees the last-entered options are what eventually lands.
  const previewInFlightRef = useRef(false);
  const pendingPreviewRef = useRef<{
    next: string[];
    options: {
      targetLanguage: string;
      sourceLanguage: string;
      context: string;
      glossaryText: string;
      outputMode: TranslateOutputModeDto;
      overwrite: boolean;
    };
  } | null>(null);

  const runPreview = useCallback(
    async (
      next: string[],
      options: {
        targetLanguage: string;
        sourceLanguage: string;
        context: string;
        glossaryText: string;
        outputMode: TranslateOutputModeDto;
        overwrite: boolean;
      },
    ) => {
      previewInFlightRef.current = true;
      const generation = ++previewGenRef.current;
      const isCurrent = () => generation === previewGenRef.current;
      setIsPreviewing(true);
      setPreviewError(undefined);
      try {
        const result = await previewTranslation(next, {
          targetLanguage: orNull(options.targetLanguage),
          sourceLanguage: orNull(options.sourceLanguage),
          context: orNull(options.context),
          glossaryText: orNull(options.glossaryText),
          outputMode: options.outputMode,
          overwrite: options.overwrite,
        });
        if (!isCurrent()) return;
        setPlan(result);
        // No prefill from the plan here: the scan already seeded the field
        // from the configuration, and echoing the resolved language back
        // would refill the box the moment the user clears it to retype.
        setSelectedIds(new Set(runnableIds(result)));
      } catch (error) {
        if (!isCurrent()) return;
        setPlan(null);
        setPreviewError(error);
      } finally {
        if (isCurrent()) setIsPreviewing(false);
        previewInFlightRef.current = false;
        const queued = pendingPreviewRef.current;
        if (queued !== null) {
          pendingPreviewRef.current = null;
          void runPreview(queued.next, queued.options);
        }
      }
    },
    [],
  );

  const refreshPreview = useCallback(
    (
      next: string[],
      options: {
        targetLanguage: string;
        sourceLanguage: string;
        context: string;
        glossaryText: string;
        outputMode: TranslateOutputModeDto;
        overwrite: boolean;
      },
    ) => {
      if (next.length === 0) {
        pendingPreviewRef.current = null;
        setPlan(null);
        setPreviewError(undefined);
        setIsPreviewing(false);
        return;
      }
      if (previewInFlightRef.current) {
        pendingPreviewRef.current = { next, options };
        return;
      }
      void runPreview(next, options);
    },
    [runPreview],
  );

  const currentOptions = useCallback(
    () => ({ targetLanguage, sourceLanguage, context, glossaryText, outputMode, overwrite }),
    [targetLanguage, sourceLanguage, context, glossaryText, outputMode, overwrite],
  );

  // Identifies the in-flight scan, so a slow scan of sources the user has
  // since changed cannot overwrite the newer one's result.
  const scanGenRef = useRef(0);

  const rescan = useCallback(async (next: string[]) => {
    if (next.length === 0) {
      scanGenRef.current += 1;
      setScan(null);
      setScanError(undefined);
      setIsScanning(false);
      return;
    }
    const generation = ++scanGenRef.current;
    const isCurrent = () => generation === scanGenRef.current;
    setIsScanning(true);
    setScanError(undefined);
    try {
      const result = await scanTranslateInputs(next);
      if (!isCurrent()) return;
      setScan(result);
      // The scan is where the configured default reaches the wizard, so that
      // Step 2 can prefill its input without a plan having been built first
      // (a plan cannot be built until a language exists). Only before the
      // user has typed anything of their own.
      setTargetLanguageState((current) =>
        current.trim() === "" ? (result.defaultTargetLanguage ?? "") : current,
      );
    } catch (error) {
      if (!isCurrent()) return;
      setScan(null);
      setScanError(error);
    } finally {
      if (isCurrent()) setIsScanning(false);
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

  const setTargetLanguage = useCallback(
    (value: string) => {
      setTargetLanguageState(value);
      void refreshPreview(sources, { ...currentOptions(), targetLanguage: value });
    },
    [refreshPreview, sources, currentOptions],
  );

  const setSourceLanguage = useCallback(
    (value: string) => {
      setSourceLanguageState(value);
      void refreshPreview(sources, { ...currentOptions(), sourceLanguage: value });
    },
    [refreshPreview, sources, currentOptions],
  );

  const setContext = useCallback(
    (value: string) => {
      setContextState(value);
      void refreshPreview(sources, { ...currentOptions(), context: value });
    },
    [refreshPreview, sources, currentOptions],
  );

  const setGlossaryText = useCallback(
    (value: string) => {
      setGlossaryTextState(value);
      void refreshPreview(sources, { ...currentOptions(), glossaryText: value });
    },
    [refreshPreview, sources, currentOptions],
  );

  const setOutputMode = useCallback(
    (mode: TranslateOutputModeDto) => {
      setOutputModeState(mode);
      void refreshPreview(sources, { ...currentOptions(), outputMode: mode });
    },
    [refreshPreview, sources, currentOptions],
  );

  const setOverwrite = useCallback(
    (value: boolean) => {
      setOverwriteState(value);
      void refreshPreview(sources, { ...currentOptions(), overwrite: value });
    },
    [refreshPreview, sources, currentOptions],
  );

  const toOptions = useCallback(() => {
    setStep("options");
    // The first plan is built on arrival, not during Step 1: it needs a target
    // language, which Step 2 is where the user can see and change. If neither
    // the form nor the configuration supplies one, this surfaces
    // `translate.no_target_language` right beside the field that fixes it.
    refreshPreview(sources, currentOptions());
  }, [refreshPreview, sources, currentOptions]);

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toTranslate = useCallback(() => {
    setProgress(null);
    setReport(null);
    setTranslateError(undefined);
    setStep("translate");
  }, []);

  const restart = useCallback(() => {
    // Bumping the local ref stops a late preview *response* from reaching
    // React state, but the backend keeps running the invocation the user
    // abandoned — Tauri does not cancel a command just because nobody awaits
    // it. `cancel_translation` bumps the backend epoch, so any in-flight
    // preview fails its commit rather than silently replacing the plan the
    // user is now acting on (mirrors convert's `restart`).
    void cancelTranslation();
    previewGenRef.current += 1;
    // Drop anything queued behind an in-flight preview: it reflects
    // pre-restart form state and must not resurrect a plan once the user is
    // back on Step 1.
    pendingPreviewRef.current = null;
    setPlan(null);
    setSelectedIds(new Set());
    setProgress(null);
    setReport(null);
    setTranslateError(undefined);
    setPreviewError(undefined);
    setIsPreviewing(false);
    setStep("sources");
  }, []);

  const translate = useCallback(async () => {
    if (plan === null) return;
    setIsTranslating(true);
    setTranslateError(undefined);
    try {
      const result = await executeTranslation(plan.planId, [...selectedIds], setProgress);
      setReport(result);
      // Only a successful batch (even one with per-item failures, or one the
      // user cancelled mid-run) advances to the Report step; a run-level
      // failure like an unconfigured provider stays on Step 3 to show it.
      setStep("report");
    } catch (error) {
      setTranslateError(error);
    } finally {
      setIsTranslating(false);
    }
  }, [plan, selectedIds]);

  const cancel = useCallback(async () => {
    // The in-flight file is abandoned and the batch still resolves with its
    // report, so there is nothing to discard here — only a request to stop.
    await cancelTranslation();
  }, []);

  const canPreview = scan !== null && scan.files.length > 0;

  return {
    step,
    sources,
    scan,
    isScanning,
    scanError,
    plan,
    isPreviewing,
    previewError,
    canPreview,
    targetLanguage,
    sourceLanguage,
    context,
    glossaryText,
    outputMode,
    overwrite,
    selectedIds,
    selectedCount: selectedIds.size,
    isTranslating,
    progress,
    report,
    translateError,
    addSources,
    removeSource,
    toOptions,
    setTargetLanguage,
    setSourceLanguage,
    setContext,
    setGlossaryText,
    setOutputMode,
    setOverwrite,
    toggleSelection,
    toTranslate,
    translate,
    cancel,
    restart,
  };
}
