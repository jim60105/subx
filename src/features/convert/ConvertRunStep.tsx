import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import { isErrorDto } from "../../types/ipc";
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
  onConvert: () => void;
  onCancel: () => void;
  onRestart: () => void;
}

/** A stale plan is the one failure with a distinct recovery: preview again. */
function isStalePlan(error: unknown): boolean {
  return isErrorDto(error) && error.code === "convert.stale_plan";
}

/**
 * Step 3: run the batch and report what happened to every item.
 *
 * Progress is per file because that is the only granularity the crate reports;
 * cancelling stops before the next file rather than interrupting the current
 * one, so the report still accounts for every selected item — as converted,
 * failed, or never started.
 */
export function ConvertRunStep({
  targetFormat,
  selectedCount,
  keepOriginal,
  isConverting,
  progress,
  report,
  convertError,
  onConvert,
  onCancel,
  onRestart,
}: ConvertRunStepProps) {
  const { t } = useTranslation("convert");
  const idle = !isConverting && report === null && convertError === undefined;

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

      {idle && (
        <div className="convert-run__actions">
          <button
            type="button"
            className="convert-run__button convert-run__button--primary"
            disabled={selectedCount === 0}
            onClick={onConvert}
          >
            {t("run.start")}
          </button>
        </div>
      )}

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
          <div className="convert-run__actions">
            <button type="button" className="convert-run__button" onClick={onCancel}>
              {t("run.cancel")}
            </button>
          </div>
        </div>
      )}

      {convertError !== undefined && (
        <div className="convert-run__error">
          <ErrorNotice error={convertError} role="status" />
          {isStalePlan(convertError) && (
            <div className="convert-run__actions">
              <button
                type="button"
                className="convert-run__button convert-run__button--primary"
                onClick={onRestart}
              >
                {t("run.report.finish")}
              </button>
            </div>
          )}
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
          <div className="convert-run__actions">
            <button
              type="button"
              className="convert-run__button convert-run__button--primary"
              onClick={onRestart}
            >
              {t("run.report.finish")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
