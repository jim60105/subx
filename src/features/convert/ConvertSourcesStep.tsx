import { useTranslation } from "react-i18next";

import { DropZone } from "../../components/DropZone/DropZone";
import type { IntakeKind } from "../../components/DropZone/DropZone";
import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import { GroupedFileList } from "../../components/GroupedFileList/GroupedFileList";
import type { ConvertScanResult } from "../../types/ipc";
import "./ConvertSourcesStep.css";

/** Convert takes subtitles, folders of them, and archives; never video. */
const INTAKE_KINDS: readonly IntakeKind[] = ["folder", "subtitle", "archive"];

interface ConvertSourcesStepProps {
  sources: string[];
  scan: ConvertScanResult | null;
  isScanning: boolean;
  scanError: unknown;
  onBrowseFiles: () => void;
  onBrowseFolder: () => void;
  onRemoveSources: (paths: string[]) => void;
}

/**
 * Step 1: gather sources and preview what the scan found.
 *
 * The drop zone shows the accepted inputs instead of describing them; the
 * sentence stays for assistive technology only. Files are added by the native
 * picker or by dropping them on the window (handled by the wizard). Archives
 * are expanded by the backend, so their contents are already included in the
 * count shown here.
 */
export function ConvertSourcesStep({
  sources,
  scan,
  isScanning,
  scanError,
  onBrowseFiles,
  onBrowseFolder,
  onRemoveSources,
}: ConvertSourcesStepProps) {
  const { t } = useTranslation("convert");
  const empty = scan !== null && scan.subtitleCount === 0;

  return (
    <div className="convert-sources">
      <h2 className="visually-hidden">{t("sources.title")}</h2>

      <DropZone
        kinds={INTAKE_KINDS}
        compact={sources.length > 0}
        description={t("sources.description")}
        onBrowseFiles={onBrowseFiles}
        onBrowseFolder={onBrowseFolder}
      />

      {sources.length > 0 && (
        <GroupedFileList paths={sources} label={t("sources.listLabel")} onRemove={onRemoveSources} />
      )}

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
