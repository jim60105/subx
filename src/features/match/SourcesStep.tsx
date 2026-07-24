import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { RelocationModeDto, SourceScanResult } from "../../types/ipc";
import "./SourcesStep.css";

const MODES: readonly RelocationModeDto[] = ["rename", "copy", "move"];

interface SourcesStepProps {
  sources: string[];
  scan: SourceScanResult | null;
  isScanning: boolean;
  scanError: unknown;
  mode: RelocationModeDto;
  onBrowseFiles: () => void;
  onBrowseFolder: () => void;
  onRemoveSource: (path: string) => void;
  onModeChange: (mode: RelocationModeDto) => void;
}

/** The last path segment, for a readable label of a long absolute path. */
function basename(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

/**
 * Step 1: gather sources, pick a relocation mode, preview the scan.
 *
 * Files are added by the native picker or by dropping them on the window
 * (handled by the wizard); this step renders the resulting list, the mode
 * choice, and the counts that gate progress.
 */
export function SourcesStep({
  sources,
  scan,
  isScanning,
  scanError,
  mode,
  onBrowseFiles,
  onBrowseFolder,
  onRemoveSource,
  onModeChange,
}: SourcesStepProps) {
  const { t } = useTranslation("match");
  const insufficient =
    scan !== null && (scan.videoCount === 0 || scan.subtitleCount === 0);

  return (
    <div className="sources-step">
      <header className="sources-step__intro">
        <h2 className="sources-step__title">{t("sources.title")}</h2>
        <p className="sources-step__description">{t("sources.description")}</p>
      </header>

      <div className="sources-step__dropzone">
        <p className="sources-step__dropzone-label">{t("sources.dropzone")}</p>
        <p className="sources-step__dropzone-hint">{t("sources.dropHint")}</p>
        <div className="sources-step__buttons">
          <button type="button" className="sources-step__button" onClick={onBrowseFiles}>
            {t("sources.browseFiles")}
          </button>
          <button type="button" className="sources-step__button" onClick={onBrowseFolder}>
            {t("sources.browseFolder")}
          </button>
        </div>
      </div>

      <ul className="sources-step__list" aria-label={t("sources.listLabel")}>
        {sources.length === 0 && <li className="sources-step__empty">{t("sources.empty")}</li>}
        {sources.map((path) => (
          <li key={path} className="sources-step__item">
            <span className="sources-step__path" title={path}>
              {basename(path)}
            </span>
            <button
              type="button"
              className="sources-step__remove"
              aria-label={t("sources.remove", { name: basename(path) })}
              onClick={() => onRemoveSource(path)}
            >
              ✕
            </button>
          </li>
        ))}
      </ul>

      <fieldset className="sources-step__modes">
        <legend className="sources-step__modes-legend">{t("sources.relocation.label")}</legend>
        {MODES.map((option) => (
          <label key={option} className="sources-step__mode">
            <input
              type="radio"
              name="relocation-mode"
              value={option}
              checked={mode === option}
              onChange={() => onModeChange(option)}
            />
            <span className="sources-step__mode-body">
              <span className="sources-step__mode-name">
                {t(`sources.relocation.${option}`)}
              </span>
              <span className="sources-step__mode-hint">
                {t(`sources.relocation.${option}Hint`)}
              </span>
            </span>
          </label>
        ))}
      </fieldset>

      <div className="sources-step__scan" role="status">
        {isScanning && <span className="sources-step__scanning">{t("sources.scan.scanning")}</span>}
        {!isScanning && scan !== null && !insufficient && (
          <span className="sources-step__counts">
            {t("sources.scan.counts", {
              videos: scan.videoCount,
              subtitles: scan.subtitleCount,
            })}
          </span>
        )}
        {!isScanning && insufficient && (
          <span className="sources-step__insufficient">{t("sources.scan.insufficient")}</span>
        )}
      </div>

      {scanError !== undefined && <ErrorNotice error={scanError} role="status" />}
    </div>
  );
}
