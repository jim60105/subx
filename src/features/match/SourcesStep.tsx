import { useTranslation } from "react-i18next";

import { DiffPreview } from "../../components/DiffPreview/DiffPreview";
import { DropZone } from "../../components/DropZone/DropZone";
import type { IntakeKind } from "../../components/DropZone/DropZone";
import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import { GroupedFileList } from "../../components/GroupedFileList/GroupedFileList";
import type { RelocationModeDto, SourceScanResult } from "../../types/ipc";
import { RELOCATION_SAMPLES } from "./relocationSamples";
import "./SourcesStep.css";

const MODES: readonly RelocationModeDto[] = ["rename", "copy", "move"];
const INTAKE_KINDS: readonly IntakeKind[] = ["folder", "video", "subtitle", "archive"];

interface SourcesStepProps {
  sources: string[];
  scan: SourceScanResult | null;
  isScanning: boolean;
  scanError: unknown;
  mode: RelocationModeDto;
  onBrowseFiles: () => void;
  onBrowseFolder: () => void;
  onRemoveSources: (paths: string[]) => void;
  onModeChange: (mode: RelocationModeDto) => void;
}

/**
 * Step 1: gather sources, pick a relocation mode, preview the scan.
 *
 * A fixed-height column whose only scroller is the source list, so the
 * relocation choice — which cannot change after analysis — stays in view
 * however many sources are listed. Files are added by the native picker or by
 * dropping them anywhere on the window (handled by the wizard).
 */
export function SourcesStep({
  sources,
  scan,
  isScanning,
  scanError,
  mode,
  onBrowseFiles,
  onBrowseFolder,
  onRemoveSources,
  onModeChange,
}: SourcesStepProps) {
  const { t } = useTranslation("match");
  const insufficient =
    scan !== null && (scan.videoCount === 0 || scan.subtitleCount === 0);

  return (
    <div className="sources-step">
      <h2 className="visually-hidden">{t("sources.title")}</h2>

      <DropZone
        kinds={INTAKE_KINDS}
        compact={sources.length > 0}
        description={t("sources.description")}
        onBrowseFiles={onBrowseFiles}
        onBrowseFolder={onBrowseFolder}
      />

      <div className="sources-step__scan" role="status">
        {isScanning && <span className="sources-step__scanning">{t("sources.scan.scanning")}</span>}
        {!isScanning && scan !== null && !insufficient && (
          <>
            <span className="sources-step__tally">
              <span className="sources-step__figure serif">{scan.videoCount}</span>{" "}
              {t("sources.scan.videoLabel", { count: scan.videoCount })}
            </span>
            <span className="sources-step__tally">
              <span className="sources-step__figure serif">{scan.subtitleCount}</span>{" "}
              {t("sources.scan.subtitleLabel", { count: scan.subtitleCount })}
            </span>
          </>
        )}
        {!isScanning && insufficient && (
          <span className="sources-step__insufficient">{t("sources.scan.insufficient")}</span>
        )}
      </div>

      {scanError !== undefined && <ErrorNotice error={scanError} role="status" />}

      {sources.length > 0 && (
        <GroupedFileList paths={sources} label={t("sources.listLabel")} onRemove={onRemoveSources} />
      )}

      <fieldset className="sources-step__modes">
        <legend className="visually-hidden">{t("sources.relocation.label")}</legend>
        {/* A fieldset is an unreliable grid container in WebKit; the grid is this div. */}
        <div className="sources-step__mode-grid">
          {MODES.map((option) => (
            <label key={option} className="sources-step__mode" data-checked={mode === option}>
              <input
                type="radio"
                className="visually-hidden"
                name="relocation-mode"
                value={option}
                checked={mode === option}
                aria-describedby={`relocation-hint-${option}`}
                onChange={() => onModeChange(option)}
              />
              <span className="sources-step__mode-name">
                <span className="sources-step__mode-dot" aria-hidden="true" />
                {t(`sources.relocation.${option}`)}
              </span>
              <DiffPreview decorative lines={RELOCATION_SAMPLES[option]} />
            </label>
          ))}
        </div>
        {/* Outside the labels, so each radio's accessible name stays the mode name. */}
        {MODES.map((option) => (
          <span key={option} id={`relocation-hint-${option}`} className="visually-hidden">
            {t(`sources.relocation.${option}Hint`)}
          </span>
        ))}
      </fieldset>
    </div>
  );
}
