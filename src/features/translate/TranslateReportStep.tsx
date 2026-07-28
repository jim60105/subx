import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { TranslationReportDto } from "../../types/ipc";
import "./TranslateReportStep.css";

interface TranslateReportStepProps {
  report: TranslationReportDto | null;
}

/**
 * Step 4: what happened to every selected item — output path, a replace-mode
 * backup path when one was made, an empty-cue-fallback warning when the
 * engine gave up on a line, and the failure code (with its hint) otherwise.
 */
export function TranslateReportStep({ report }: TranslateReportStepProps) {
  const { t } = useTranslation("translate");

  if (report === null) return null;

  return (
    <div className="translate-report">
      <header className="translate-report__intro">
        <h2 className="translate-report__title">{t("report.title")}</h2>
        <p className="translate-report__summary" role="status">
          {t("report.summary", { success: report.successCount, failure: report.failureCount })}
        </p>
        {report.cancelled && (
          <p className="translate-report__cancelled">{t("report.cancelled")}</p>
        )}
      </header>

      <ul className="translate-report__outcomes">
        {report.outcomes.map((outcome, index) => (
          <li
            key={`${outcome.inputName}-${index}`}
            className="translate-report__outcome"
            data-status={outcome.status}
          >
            <span className="translate-report__outcome-name">{outcome.inputName}</span>
            <span className="translate-report__outcome-status">
              {t(`report.status.${outcome.status}`)}
            </span>
            {outcome.backupPath !== null && (
              <span className="translate-report__outcome-flag">
                {t("report.backupCreated", { path: outcome.backupPath })}
              </span>
            )}
            {outcome.warning !== null && <ErrorNotice error={outcome.warning} role="status" />}
            {outcome.error !== null && <ErrorNotice error={outcome.error} role="status" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
