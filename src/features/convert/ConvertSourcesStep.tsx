import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { ConvertScanResult } from "../../types/ipc";
import "./ConvertSourcesStep.css";

interface ConvertSourcesStepProps {
  sources: string[];
  scan: ConvertScanResult | null;
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
 * Step 1: gather sources and preview what the scan found.
 *
 * Files are added by the native picker or by dropping them on the window
 * (handled by the wizard); this step renders the resulting list and the count
 * that gates progress. Archives are expanded by the backend, so their contents
 * are already included in the count shown here.
 */
export function ConvertSourcesStep({
  sources,
  scan,
  isScanning,
  scanError,
  onBrowseFiles,
  onBrowseFolder,
  onRemoveSource,
}: ConvertSourcesStepProps) {
  const { t } = useTranslation("convert");
  const empty = scan !== null && scan.subtitleCount === 0;

  return (
    <div className="convert-sources">
      <header className="convert-sources__intro">
        <h2 className="convert-sources__title">{t("sources.title")}</h2>
        <p className="convert-sources__description">{t("sources.description")}</p>
      </header>

      <div className="convert-sources__dropzone">
        <p className="convert-sources__dropzone-label">{t("sources.dropzone")}</p>
        <p className="convert-sources__dropzone-hint">{t("sources.dropHint")}</p>
        <div className="convert-sources__buttons">
          <button type="button" className="convert-sources__button" onClick={onBrowseFiles}>
            {t("sources.browseFiles")}
          </button>
          <button type="button" className="convert-sources__button" onClick={onBrowseFolder}>
            {t("sources.browseFolder")}
          </button>
        </div>
      </div>

      <ul className="convert-sources__list" aria-label={t("sources.listLabel")}>
        {sources.length === 0 && (
          <li className="convert-sources__empty">{t("sources.empty")}</li>
        )}
        {sources.map((path) => (
          <li key={path} className="convert-sources__item">
            <span className="convert-sources__path" title={path}>
              {basename(path)}
            </span>
            <button
              type="button"
              className="convert-sources__remove"
              aria-label={t("sources.remove", { name: basename(path) })}
              onClick={() => onRemoveSource(path)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <div className="convert-sources__scan" role="status">
        {isScanning && (
          <span className="convert-sources__scanning">{t("sources.scan.scanning")}</span>
        )}
        {!isScanning && scan !== null && !empty && (
          <span className="convert-sources__count">
            {t("sources.scan.count", { count: scan.subtitleCount })}
          </span>
        )}
        {!isScanning && empty && (
          <span className="convert-sources__none">{t("sources.scan.none")}</span>
        )}
      </div>

      {scanError !== undefined && <ErrorNotice error={scanError} role="status" />}
    </div>
  );
}
