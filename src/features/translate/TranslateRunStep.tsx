import { useEffect, useRef, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import { BatchProgressBar } from "./BatchProgressBar";
import type { ProgressRow, RunProgress } from "./progressReducer";
import "./TranslateRunStep.css";

interface TranslateRunStepProps {
  selectedCount: number;
  isTranslating: boolean;
  progress: RunProgress | null;
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

/** `m:ss`, or `h:mm:ss` from an hour on. */
export function formatClock(seconds: number): string {
  const whole = Math.max(0, Math.round(seconds));
  const h = Math.floor(whole / 3600);
  const m = Math.floor((whole % 3600) / 60);
  const s = String(whole % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** The batch a status names: the one in flight, else the last one returned. */
function batchPosition(row: ProgressRow): number {
  return row.batchInFlight > 0 ? row.batchInFlight : row.batchesDone;
}

/**
 * The phase in words. `forStatus` leaves out the resend, so the live status
 * line changes only with the file, the phase or the batch number (design D9).
 */
function phaseLabel(t: TFunction<"translate">, row: ProgressRow, forStatus: boolean): string {
  switch (row.stage) {
    case "terminology":
      return t("run.phase.terminology");
    case "translating":
      return t(row.resend && !forStatus ? "run.phase.resending" : "run.phase.translating", {
        batch: batchPosition(row),
        batches: row.batchTotal,
      });
    case "fillIn":
      return t("run.phase.fillIn");
    case "writing":
      return t("run.phase.writing");
    default:
      return t("run.phase.fileDone");
  }
}

function rowOutcomeText(t: TFunction<"translate">, row: ProgressRow, cues: string): string {
  const seconds =
    row.startedAt !== null && row.finishedAt !== null ? (row.finishedAt - row.startedAt) / 1000 : 0;
  switch (row.outcome) {
    case "translated":
      return t("run.row.translated", { cues, time: formatClock(seconds) });
    case "failed":
      return t("run.row.failed", { cues, time: formatClock(seconds) });
    case "skipped":
      return t("run.row.skipped", { cues });
    default:
      return t("run.row.cancelled", { cues });
  }
}

/**
 * Step 3: run the batch with one row per selected file (design D7–D9). Every
 * visual change follows a progress event from the backend: the active file's
 * bar has one segment per real AI batch. Cancellation can land mid-file
 * (design D3): the file in flight is abandoned unwritten. Starting,
 * cancelling and recovering are the wizard's action bar.
 */
export function TranslateRunStep({
  selectedCount,
  isTranslating,
  progress,
  translateError,
}: TranslateRunStepProps) {
  const { t, i18n } = useTranslation("translate");
  const elapsed = useElapsedSeconds(isTranslating);
  const number = new Intl.NumberFormat(i18n.language);

  const currentRow = progress?.current ? progress.rows[progress.current.itemId] : undefined;
  const activeRow =
    progress === null
      ? undefined
      : progress.order.map((id) => progress.rows[id]).find((row) => row.status === "active");

  let status = t("run.starting");
  if (progress?.finished) {
    status = t("run.finished");
  } else if (progress?.current && currentRow !== undefined) {
    status = t("run.status", {
      index: progress.current.index,
      total: progress.current.total,
      name: progress.current.fileName,
      phase: phaseLabel(t, currentRow, true),
    });
  }

  return (
    <div className="translate-run">
      <header className="translate-run__intro">
        <h2 className="translate-run__title">{t("run.title")}</h2>
        <p className="translate-run__summary">{t("run.summary", { count: selectedCount })}</p>
      </header>

      {progress !== null && (
        <div className="translate-run__progress">
          {/* The step's only live region for progress. */}
          <p className="translate-run__status" role="status">
            {status}
          </p>
          <p className="translate-run__meta">
            <span>{t("run.elapsed", { time: formatClock(elapsed) })}</span>
            {!progress.finished && (
              <span>
                {progress.estimateMs === null
                  ? t("run.estimate.pending")
                  : t("run.estimate.value", { time: formatClock(progress.estimateMs / 1000) })}
              </span>
            )}
          </p>
          <p className="translate-run__notice">
            {activeRow?.resend && activeRow.stage === "translating"
              ? t("run.resend", { batch: activeRow.batchInFlight })
              : null}
          </p>

          <ol className="translate-run__rows" aria-label={t("run.rowsLabel")}>
            {progress.order.map((id, position) => {
              const row = progress.rows[id];
              const cues = number.format(row.totalCues);
              let count: string;
              if (row.status === "waiting") count = t("run.row.waiting", { cues });
              else if (row.status === "done") count = rowOutcomeText(t, row, cues);
              else count = t("run.row.counter", { processed: number.format(row.processedCues), total: cues });
              return (
                <li
                  key={id}
                  className="translate-run__row"
                  data-status={row.status}
                  data-outcome={row.outcome ?? undefined}
                >
                  <div className="translate-run__row-head">
                    <span className="translate-run__row-number">{position + 1}</span>
                    <span className="translate-run__row-name" title={row.name}>
                      {row.name}
                    </span>
                    <span className="translate-run__row-phase">
                      {row.status === "active" ? phaseLabel(t, row, false) : null}
                    </span>
                    <span className="translate-run__row-count">
                      {/* A decorative mark beside the outcome word; the word carries the meaning. */}
                      {row.outcome === "translated" && <span aria-hidden="true">✓ </span>}
                      {row.outcome === "failed" && <span aria-hidden="true">✕ </span>}
                      {count}
                    </span>
                  </div>
                  {row.status === "active" && progress.batchSize !== null && (
                    <BatchProgressBar
                      totalCues={row.totalCues}
                      batchSize={progress.batchSize}
                      batchTotal={row.batchTotal}
                      batchesDone={row.batchesDone}
                      batchInFlight={row.batchInFlight}
                      resend={row.resend}
                      stage={row.stage}
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {translateError !== undefined && (
        <div className="translate-run__error">
          {/* Its default `alert` role: an error must not be a second polite live region. */}
          <ErrorNotice error={translateError} />
        </div>
      )}
    </div>
  );
}
