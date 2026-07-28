import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { TranslateScanResult } from "../../types/ipc";
import "./TranslateSourcesStep.css";

interface TranslateSourcesStepProps {
  sources: string[];
  scan: TranslateScanResult | null;
  isScanning: boolean;
  scanError: unknown;
  onBrowseFiles: () => void;
  onBrowseFolder: () => void;
  onRemoveSource: (path: string) => void;
}

/** The last path segment, for a readable label of a long absolute path. */
function basename(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/**
 * Step 1: gather sources and preview what the scan found, with a per-file cue
 * count so the size of the coming AI job is visible before any request is
 * sent.
 *
 * The scan is deliberately its own backend call rather than the Step 2 plan:
 * a plan cannot be resolved without a target language, and the field that
 * supplies one is on Step 2 — scanning here must not depend on it.
 */
export function TranslateSourcesStep({
  sources,
  scan,
  isScanning,
  scanError,
  onBrowseFiles,
  onBrowseFolder,
  onRemoveSource,
}: TranslateSourcesStepProps) {
  const { t } = useTranslation("translate");
  const { t: tError } = useTranslation("errors");
  const totalCues = scan === null ? 0 : scan.files.reduce((sum, file) => sum + file.cueCount, 0);

  return (
    <div className="translate-sources">
      <header className="translate-sources__intro">
        <h2 className="translate-sources__title">{t("sources.title")}</h2>
        <p className="translate-sources__description">{t("sources.description")}</p>
      </header>

      <div className="translate-sources__dropzone">
        <p className="translate-sources__dropzone-label">{t("sources.dropzone")}</p>
        <p className="translate-sources__dropzone-hint">{t("sources.dropHint")}</p>
        <div className="translate-sources__buttons">
          <button type="button" className="translate-sources__button" onClick={onBrowseFiles}>
            {t("sources.browseFiles")}
          </button>
          <button type="button" className="translate-sources__button" onClick={onBrowseFolder}>
            {t("sources.browseFolder")}
          </button>
        </div>
      </div>

      <ul className="translate-sources__list" aria-label={t("sources.listLabel")}>
        {sources.length === 0 && (
          <li className="translate-sources__empty">{t("sources.empty")}</li>
        )}
        {sources.map((path) => (
          <li key={path} className="translate-sources__item">
            <span className="translate-sources__path" title={path}>
              {basename(path)}
            </span>
            <button
              type="button"
              className="translate-sources__remove"
              aria-label={t("sources.remove", { name: basename(path) })}
              onClick={() => onRemoveSource(path)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="translate-sources__scan" role="status">
        {isScanning && (
          <span className="translate-sources__scanning">{t("sources.scan.scanning")}</span>
        )}
        {!isScanning && scan !== null && scan.files.length > 0 && (
          <span className="translate-sources__count">
            {t("sources.scan.count", { total: totalCues })}
          </span>
        )}
      </div>

      {!isScanning && scan !== null && scan.files.length > 0 && (
        <ul className="translate-sources__files" aria-label={t("sources.filesLabel")}>
          {scan.files.map((file) => (
            <li key={file.name} className="translate-sources__file">
              <span className="translate-sources__file-name">{file.name}</span>
              {file.unparsable ? (
                <span className="translate-sources__file-flag">
                  {tError("codes.translate.unparsable")}
                </span>
              ) : (
                <span className="translate-sources__file-cues">
                  {t("sources.scan.cues", { count: file.cueCount })}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {scanError !== undefined && <ErrorNotice error={scanError} role="status" />}
    </div>
  );
}
