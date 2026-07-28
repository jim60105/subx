import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { TranslateProgress } from "../../types/ipc";
import "./TranslateRunStep.css";

interface TranslateRunStepProps {
  selectedCount: number;
  isTranslating: boolean;
  progress: TranslateProgress | null;
  translateError: unknown;
}

/** Whole seconds since `active` last became true, reset back to 0 otherwise. */
function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0);
  const startedAt = useRef<number | null>(null);

  useEffect(() => {
    if (!active) {
      startedAt.current = null;
      setElapsed(0);
      return;
    }
    startedAt.current = Date.now();
    setElapsed(0);
    const id = window.setInterval(() => {
      if (startedAt.current !== null) {
        setElapsed(Math.floor((Date.now() - startedAt.current) / 1000));
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [active]);

  return elapsed;
}

/**
 * Step 3: run the batch, per-file only — the engine reports nothing from
 * inside a file, so there is no percentage to show, only elapsed time to keep
 * a large file from reading as stuck. Cancellation can land mid-file (design
 * D3): the file in flight is abandoned unwritten, not finished first. Starting,
 * cancelling and recovering are the wizard's action bar.
 */
export function TranslateRunStep({
  selectedCount,
  isTranslating,
  progress,
  translateError,
}: TranslateRunStepProps) {
  const { t } = useTranslation("translate");
  const elapsed = useElapsedSeconds(isTranslating);

  return (
    <div className="translate-run">
      <header className="translate-run__intro">
        <h2 className="translate-run__title">{t("run.title")}</h2>
        <p className="translate-run__summary">{t("run.summary", { count: selectedCount })}</p>
      </header>

      {isTranslating && (
        <div className="translate-run__progress">
          <p className="translate-run__progress-text" role="status">
            {progress === null || progress.stage === "finished"
              ? t("run.starting")
              : t("run.progress", {
                  index: progress.index,
                  total: progress.total,
                  name: progress.fileName,
                })}
          </p>
          <p className="translate-run__elapsed">{t("run.elapsed", { seconds: elapsed })}</p>
        </div>
      )}

      {translateError !== undefined && (
        <div className="translate-run__error">
          <ErrorNotice error={translateError} role="status" />
        </div>
      )}
    </div>
  );
}
