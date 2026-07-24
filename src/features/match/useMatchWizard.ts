import { useCallback, useMemo, useRef, useState } from "react";

import { isErrorDto } from "../../types/ipc";
import type {
  ExecutionReportDto,
  MatchPlanDto,
  MatchStage,
  RelocationModeDto,
  SourceScanResult,
} from "../../types/ipc";
import {
  analyzeSources,
  cancelAnalysis,
  executeSelected,
  scanSources,
} from "./matchWizardApi";

export type WizardStepId = "sources" | "analysis" | "review" | "execute";

/** Ordered step ids, used for the WizardShell indicator. */
export const WIZARD_STEPS: readonly WizardStepId[] = [
  "sources",
  "analysis",
  "review",
  "execute",
] as const;

export interface MatchWizard {
  step: WizardStepId;
  sources: string[];
  mode: RelocationModeDto;
  scan: SourceScanResult | null;
  isScanning: boolean;
  scanError: unknown;
  /** True once a scan proves the sources hold both a video and a subtitle. */
  canAnalyze: boolean;
  stage: MatchStage | null;
  analysisError: unknown;
  plan: MatchPlanDto | null;
  selectedIds: Set<number>;
  selectedCount: number;
  totalOperations: number;
  isExecuting: boolean;
  report: ExecutionReportDto | null;
  executeError: unknown;
  addSources: (paths: string[]) => void;
  removeSource: (path: string) => void;
  setMode: (mode: RelocationModeDto) => void;
  analyze: () => Promise<void>;
  cancel: () => Promise<void>;
  retry: () => void;
  toggleSelection: (id: number) => void;
  toReview: () => void;
  toExecute: () => void;
  execute: () => Promise<void>;
  /** Discards the plan and returns to Step 1 (back-past-analysis, stale plan). */
  restart: () => void;
}

function operationIds(plan: MatchPlanDto): number[] {
  return plan.videos.flatMap((video) => video.matches.map((match) => match.id));
}

/** A rejection the frontend should swallow because it asked for the cancel. */
function isCancellation(error: unknown): boolean {
  return isErrorDto(error) && error.code === "match.analysis_cancelled";
}

/**
 * The match wizard's state machine.
 *
 * Owns every piece of wizard state and the backend calls; the step components
 * are presentational. The canonical plan lives in the backend — this holds only
 * the display DTO and the set of selected operation ids.
 */
export function useMatchWizard(): MatchWizard {
  const [step, setStep] = useState<WizardStepId>("sources");
  const [sources, setSources] = useState<string[]>([]);
  const [mode, setMode] = useState<RelocationModeDto>("rename");
  const [scan, setScan] = useState<SourceScanResult | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [scanError, setScanError] = useState<unknown>(undefined);
  const [stage, setStage] = useState<MatchStage | null>(null);
  const [analysisError, setAnalysisError] = useState<unknown>(undefined);
  const [plan, setPlan] = useState<MatchPlanDto | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isExecuting, setIsExecuting] = useState(false);
  const [report, setReport] = useState<ExecutionReportDto | null>(null);
  const [executeError, setExecuteError] = useState<unknown>(undefined);

  // Identifies the in-flight analysis. `cancel` and each new `analyze` bump it,
  // so a superseded or cancelled call applies none of its late results.
  const analysisGenRef = useRef(0);

  const rescan = useCallback(async (next: string[]) => {
    if (next.length === 0) {
      setScan(null);
      setScanError(undefined);
      return;
    }
    setIsScanning(true);
    setScanError(undefined);
    try {
      setScan(await scanSources(next));
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

  const analyze = useCallback(async () => {
    const generation = ++analysisGenRef.current;
    const isCurrent = () => generation === analysisGenRef.current;
    setStep("analysis");
    setStage("scanning");
    setAnalysisError(undefined);
    try {
      const result = await analyzeSources(sources, mode, (progress) => {
        // Ignore progress from a cancelled or superseded analysis.
        if (isCurrent()) setStage(progress.stage);
      });
      // A cancel (or a newer analyze) since we started discards this result.
      if (!isCurrent()) return;
      setPlan(result);
      setSelectedIds(new Set(operationIds(result)));
      setStep("review");
    } catch (error) {
      // A cancel the user asked for, or a superseded call, is not an error.
      if (!isCurrent() || isCancellation(error)) return;
      setAnalysisError(error);
    }
  }, [sources, mode]);

  const cancel = useCallback(async () => {
    // Invalidate the in-flight analysis so its late result is dropped.
    analysisGenRef.current += 1;
    await cancelAnalysis();
    setStage(null);
    setStep("sources");
  }, []);

  const retry = useCallback(() => {
    void analyze();
  }, [analyze]);

  const restart = useCallback(() => {
    setPlan(null);
    setSelectedIds(new Set());
    setReport(null);
    setExecuteError(undefined);
    setStep("sources");
  }, []);

  const toggleSelection = useCallback((id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toReview = useCallback(() => {
    setStep("review");
  }, []);

  const toExecute = useCallback(() => {
    setReport(null);
    setExecuteError(undefined);
    setStep("execute");
  }, []);

  const execute = useCallback(async () => {
    if (plan === null) return;
    setIsExecuting(true);
    setExecuteError(undefined);
    try {
      setReport(await executeSelected(plan.planId, [...selectedIds]));
    } catch (error) {
      setExecuteError(error);
    } finally {
      setIsExecuting(false);
    }
  }, [plan, selectedIds]);

  const canAnalyze =
    sources.length > 0 &&
    !isScanning &&
    scan !== null &&
    scan.videoCount > 0 &&
    scan.subtitleCount > 0;

  const totalOperations = useMemo(() => (plan ? operationIds(plan).length : 0), [plan]);

  return {
    step,
    sources,
    mode,
    scan,
    isScanning,
    scanError,
    canAnalyze,
    stage,
    analysisError,
    plan,
    selectedIds,
    selectedCount: selectedIds.size,
    totalOperations,
    isExecuting,
    report,
    executeError,
    addSources,
    removeSource,
    setMode,
    analyze,
    cancel,
    retry,
    toggleSelection,
    toReview,
    toExecute,
    execute,
    restart,
  };
}
