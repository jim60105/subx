import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { DiffLine } from "../../components/DiffPreview/DiffPreview";
import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { ExecutionReportDto, MatchPlanDto, RelocationModeDto } from "../../types/ipc";
import { buildExecuteRows } from "./executeRows";
import type { ExecuteRow } from "./executeRows";
import "./ExecuteStep.css";

interface ExecuteStepProps {
  plan: MatchPlanDto;
  selectedIds: Set<number>;
  mode: RelocationModeDto;
  isExecuting: boolean;
  report: ExecutionReportDto | null;
  executeError: unknown;
}

type RowStatus = "pending" | "ok" | "failed" | "skipped";

/**
 * The backend counts a failure only when an error is present, so an unapplied
 * outcome without one is shown neutrally rather than as a failure.
 */
function statusOf({ outcome }: ExecuteRow): RowStatus {
  if (outcome === null) return "pending";
  if (outcome.applied) return "ok";
  return outcome.error !== null ? "failed" : "skipped";
}

const MARKS: Record<RowStatus, string> = { pending: "·", ok: "✓", failed: "✕", skipped: "·" };

/**
 * Step 4: every selected operation as `old → new`, then the outcome of each.
 *
 * `executeSelected` resolves once with the whole report, so while it runs the
 * step shows an indeterminate sweep and no row claims a result. When the
 * report arrives every row carries its outcome at once; the top-to-bottom
 * stagger is CSS delay only, which the reduced-motion rule removes. Running
 * and finishing are the wizard's action bar.
 */
export function ExecuteStep({ plan, selectedIds, mode, isExecuting, report, executeError }: ExecuteStepProps) {
  const { t } = useTranslation("match");
  const rows = buildExecuteRows(plan, selectedIds, report);
  const phase = report !== null ? "done" : isExecuting ? "running" : "idle";
  // A copy leaves the original on disk, so its old name stays as a kept line.
  const oldKind = mode === "copy" ? "kept" : "removed";

  return (
    <div className="execute-step" data-phase={phase}>
      <h2 className="visually-hidden">{t("execute.title")}</h2>

      <div className="execute-step__figures" role="status">
        {report === null ? (
          <p className="execute-step__tally">
            <span className="execute-step__figure serif">{rows.length}</span>{" "}
            {t("execute.summaryLabel", { count: rows.length, mode: t(`execute.modes.${mode}`) })}
          </p>
        ) : (
          <>
            <p className="execute-step__tally" data-result="success">
              <span className="execute-step__figure serif">{report.successCount}</span>{" "}
              {t("execute.report.succeededLabel", { count: report.successCount })}
            </p>
            <p className="execute-step__tally" data-result="failure">
              <span className="execute-step__figure serif">{report.failureCount}</span>{" "}
              {t("execute.report.failedLabel", { count: report.failureCount })}
            </p>
          </>
        )}
      </div>

      <div
        className="execute-step__sweep"
        {...(phase === "running"
          ? { role: "progressbar", "aria-label": t("execute.running") }
          : { "aria-hidden": true })}
      />

      {executeError !== undefined && (
        <div className="execute-step__error">
          <ErrorNotice error={executeError} role="status" />
        </div>
      )}

      <ol className="execute-step__rows" aria-label={t("execute.listLabel")}>
        {rows.map((row, index) => {
          const status = statusOf(row);
          return (
            <li
              key={row.key}
              className="execute-step__row"
              data-status={status}
              style={{ "--row": index } as CSSProperties}
            >
              <span className="execute-step__mark" aria-hidden="true">
                {MARKS[status]}
              </span>
              {status === "ok" ? (
                <DiffLine kind={oldKind} text={row.oldName} />
              ) : (
                <span className="execute-step__name">{row.oldName}</span>
              )}
              <span className="execute-step__arrow" aria-hidden="true">
                →
              </span>
              {status === "ok" ? (
                <DiffLine kind="created" text={row.newName} />
              ) : (
                <span className="execute-step__name" data-role="new">
                  {row.newName}
                </span>
              )}
              {(status === "ok" || status === "failed") && (
                <span className="visually-hidden">
                  {t(status === "ok" ? "execute.report.succeeded" : "execute.report.failed")}
                </span>
              )}
              {row.outcome?.error != null && (
                <div className="execute-step__row-error">
                  <ErrorNotice error={row.outcome.error} role="status" />
                </div>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
