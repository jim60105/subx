import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { SyncApplyResultDto } from "../../types/ipc";
import "./SyncApplyStep.css";

interface SyncApplyStepProps {
  offsetMs: number;
  outputPath: string;
  isApplying: boolean;
  applyResult: SyncApplyResultDto | null;
  applyError: unknown;
  /** Whether a refusal is pending; that is what offers the confirmation. */
  canConfirmOverwrite: boolean;
  onOutputPathChange: (path: string) => void;
  onApply: () => void;
  onConfirmOverwrite: () => void;
  onRestart: () => void;
}

/**
 * Step 4: choose where the shifted subtitle goes, write it, and report.
 *
 * The original is never touched; the output defaults to a `_synced` sibling and
 * the field is editable. An existing target is refused rather than replaced —
 * the backend fails before doing any work and the confirmation here retries with
 * the overwrite allowed (design D5), which keeps `sync`'s block-by-default
 * contract rather than borrowing `convert`'s silent replacement.
 */
export function SyncApplyStep({
  offsetMs,
  outputPath,
  isApplying,
  applyResult,
  applyError,
  canConfirmOverwrite,
  onOutputPathChange,
  onApply,
  onConfirmOverwrite,
  onRestart,
}: SyncApplyStepProps) {
  const { t } = useTranslation("sync");
  const done = applyResult !== null;

  return (
    <div className="sync-apply">
      <header className="sync-apply__intro">
        <h2 className="sync-apply__title">{t("apply.title")}</h2>
        <p className="sync-apply__summary">
          {t("apply.summary", { seconds: (offsetMs / 1000).toFixed(3) })}
        </p>
      </header>

      {!done && (
        <>
          <label className="sync-apply__field">
            <span className="sync-apply__field-label">{t("apply.outputLabel")}</span>
            <input
              type="text"
              className="sync-apply__input"
              value={outputPath}
              onChange={(event) => onOutputPathChange(event.target.value)}
            />
          </label>
          <p className="sync-apply__note">{t("apply.originalKept")}</p>

          <div className="sync-apply__actions">
            <button
              type="button"
              className="sync-apply__button sync-apply__button--primary"
              disabled={isApplying}
              onClick={onApply}
            >
              {isApplying ? t("apply.applying") : t("apply.start")}
            </button>
          </div>
        </>
      )}

      {applyError !== undefined && (
        <div className="sync-apply__error">
          <ErrorNotice error={applyError} role="status" />
          {canConfirmOverwrite && (
            <div className="sync-apply__actions">
              <button
                type="button"
                className="sync-apply__button sync-apply__button--primary"
                disabled={isApplying}
                onClick={onConfirmOverwrite}
              >
                {t("apply.confirmOverwrite")}
              </button>
            </div>
          )}
        </div>
      )}

      {applyResult !== null && (
        <section className="sync-apply__report">
          <h3 className="sync-apply__report-title">{t("apply.report.title")}</h3>
          <p className="sync-apply__report-path" role="status">
            {t("apply.report.written")} <code>{applyResult.outputPath}</code>
          </p>
          {applyResult.overwritten && (
            <p className="sync-apply__report-flag">{t("apply.report.overwritten")}</p>
          )}
          <div className="sync-apply__actions">
            <button
              type="button"
              className="sync-apply__button sync-apply__button--primary"
              onClick={onRestart}
            >
              {t("apply.report.finish")}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
