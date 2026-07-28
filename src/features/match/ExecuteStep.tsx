import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { ExecutionReportDto, RelocationModeDto } from "../../types/ipc";
import "./ExecuteStep.css";

interface ExecuteStepProps {
  mode: RelocationModeDto;
  selectedCount: number;
  report: ExecutionReportDto | null;
  executeError: unknown;
}

/**
 * Step 4: what will be applied, and what came of it.
 *
 * Execution never aborts on a per-item failure; the report lists every selected
 * operation with its result. Running and finishing are the wizard's action bar.
 */
export function ExecuteStep({ mode, selectedCount, report, executeError }: ExecuteStepProps) {
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

      {executeError !== undefined && (
        <div className="execute-step__error">
          <ErrorNotice error={executeError} role="status" />
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
        </section>
      )}
    </div>
  );
}
