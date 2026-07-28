import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type {
  ConversionReportDto,
  ConvertFormatDto,
  ConvertProgress,
} from "../../types/ipc";
import "./ConvertRunStep.css";

interface ConvertRunStepProps {
  targetFormat: ConvertFormatDto | null;
  selectedCount: number;
  keepOriginal: boolean;
  isConverting: boolean;
  progress: ConvertProgress | null;
  report: ConversionReportDto | null;
  convertError: unknown;
}

/**
 * Step 3: what is about to run, how far it has got, and what came of it.
 *
 * Progress is per file because that is the only granularity the crate reports;
 * cancelling stops before the next file rather than interrupting the current
 * one, so the report still accounts for every selected item — as converted,
 * failed, or never started. Starting, cancelling and finishing are the
 * wizard's action bar.
 */
export function ConvertRunStep({
  targetFormat,
  selectedCount,
  keepOriginal,
  isConverting,
  progress,
  report,
  convertError,
}: ConvertRunStepProps) {
  const { t } = useTranslation("convert");

  return (
    <div className="convert-run">
      <header className="convert-run__intro">
        <h2 className="convert-run__title">{t("run.title")}</h2>
        <p className="convert-run__summary">
          {t("run.summary", {
            count: selectedCount,
            format: targetFormat === null ? "" : t(`options.formats.${targetFormat}`),
          })}
        </p>
        <p className="convert-run__originals">
          {keepOriginal ? t("run.keepingOriginals") : t("run.removingOriginals")}
        </p>
      </header>

      {isConverting && (
        <div className="convert-run__progress">
          <p className="convert-run__progress-text" role="status">
            {progress === null || progress.stage === "finished"
              ? t("run.starting")
              : t("run.progress", {
                  index: progress.index,
                  total: progress.total,
                  name: progress.fileName,
                })}
          </p>
        </div>
      )}

      {convertError !== undefined && (
        <div className="convert-run__error">
          <ErrorNotice error={convertError} role="status" />
        </div>
      )}

      {report !== null && (
        <section className="convert-run__report">
          <h3 className="convert-run__report-title">{t("run.report.title")}</h3>
          <p className="convert-run__report-summary" role="status">
            {t("run.report.summary", {
              success: report.successCount,
              failure: report.failureCount,
            })}
          </p>
          {report.cancelled && (
            <p className="convert-run__report-cancelled">{t("run.report.cancelled")}</p>
          )}
          <ul className="convert-run__outcomes">
            {report.outcomes.map((outcome, index) => (
              <li
                key={`${outcome.inputName}-${index}`}
                className="convert-run__outcome"
                data-status={outcome.status}
              >
                <span className="convert-run__outcome-name">{outcome.inputName}</span>
                <span className="convert-run__outcome-status">
                  {t(`run.report.status.${outcome.status}`)}
                </span>
                {outcome.overwritten && (
                  <span className="convert-run__outcome-flag">{t("run.report.overwritten")}</span>
                )}
                {outcome.originalRemoved && (
                  <span className="convert-run__outcome-flag">
                    {t("run.report.originalRemoved")}
                  </span>
                )}
                {outcome.warning !== null && <ErrorNotice error={outcome.warning} role="status" />}
                {outcome.error !== null && <ErrorNotice error={outcome.error} role="status" />}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
