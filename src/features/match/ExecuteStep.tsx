import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import { isErrorDto } from "../../types/ipc";
import type { ExecutionReportDto, RelocationModeDto } from "../../types/ipc";
import "./ExecuteStep.css";

interface ExecuteStepProps {
  mode: RelocationModeDto;
  selectedCount: number;
  isExecuting: boolean;
  report: ExecutionReportDto | null;
  executeError: unknown;
  onExecute: () => void;
  onRestart: () => void;
}

/** A stale plan is the one execute failure with a distinct recovery: re-analyze. */
function isStalePlan(error: unknown): boolean {
  return isErrorDto(error) && error.code === "match.stale_plan";
}

/**
 * Step 4: confirm the plan and apply it, then report each item's outcome.
 *
 * Execution never aborts on a per-item failure; the report lists every selected
 * operation with its result. A stale plan — one a newer analysis replaced —
 * is the one failure that offers a restart rather than a retry.
 */
export function ExecuteStep({
  mode,
  selectedCount,
  isExecuting,
  report,
  executeError,
  onExecute,
  onRestart,
}: ExecuteStepProps) {
  const { t } = useTranslation("match");

  return (
    <div className="execute-step">
      <header className="execute-step__intro">
        <h2 className="execute-step__title">{t("execute.title")}</h2>
        <p className="execute-step__summary">
          {t("execute.summary", {
            count: selectedCount,
            mode: t(`execute.modes.${mode}`),
          })}
        </p>
      </header>

      {report === null && executeError === undefined && (
        <div className="execute-step__actions">
          <button
            type="button"
            className="execute-step__button execute-step__button--primary"
            disabled={isExecuting || selectedCount === 0}
            onClick={onExecute}
          >
            {isExecuting ? t("execute.running") : t("execute.run")}
          </button>
        </div>
      )}

      {executeError !== undefined && (
        <div className="execute-step__error">
          <ErrorNotice error={executeError} role="status" />
          {isStalePlan(executeError) && (
            <div className="execute-step__actions">
              <button
                type="button"
                className="execute-step__button execute-step__button--primary"
                onClick={onRestart}
              >
                {t("execute.report.finish")}
              </button>
            </div>
          )}
        </div>
      )}

      {report !== null && (
        <section className="execute-step__report">
          <h3 className="execute-step__report-title">{t("execute.report.title")}</h3>
          <p className="execute-step__report-summary" role="status">
            {t("execute.report.summary", {
              success: report.successCount,
              failure: report.failureCount,
            })}
          </p>
          <ul className="execute-step__outcomes">
            {report.outcomes.map((outcome, index) => (
              <li
                key={`${outcome.subtitleName}-${index}`}
                className="execute-step__outcome"
                data-status={outcome.applied ? "ok" : "failed"}
              >
                <span className="execute-step__outcome-name">{outcome.subtitleName}</span>
                <span className="execute-step__outcome-status">
                  {outcome.applied
                    ? t("execute.report.succeeded")
                    : t("execute.report.failed")}
                </span>
                {outcome.error !== null && <ErrorNotice error={outcome.error} role="status" />}
              </li>
            ))}
          </ul>
          <div className="execute-step__actions">
            <button
              type="button"
              className="execute-step__button execute-step__button--primary"
              onClick={onRestart}
            >
              {t("execute.report.finish")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
