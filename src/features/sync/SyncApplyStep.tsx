import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { SyncApplyResultDto } from "../../types/ipc";
import "./SyncApplyStep.css";

interface SyncApplyStepProps {
  offsetMs: number;
  outputPath: string;
  applyResult: SyncApplyResultDto | null;
  applyError: unknown;
  onOutputPathChange: (path: string) => void;
}

/**
 * Step 4: choose where the shifted subtitle goes, and report where it went.
 *
 * The original is never touched; the output defaults to a `_synced` sibling and
 * the field is editable. An existing target is refused rather than replaced —
 * the backend fails before doing any work and the wizard's action bar offers
 * the confirmation that retries with the overwrite allowed (design D5), which
 * keeps `sync`'s block-by-default contract rather than borrowing `convert`'s
 * silent replacement.
 */
export function SyncApplyStep({
  offsetMs,
  outputPath,
  applyResult,
  applyError,
  onOutputPathChange,
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
        </>
      )}

      {applyError !== undefined && (
        <div className="sync-apply__error">
          <ErrorNotice error={applyError} role="status" />
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
        </section>
      )}
    </div>
  );
}
