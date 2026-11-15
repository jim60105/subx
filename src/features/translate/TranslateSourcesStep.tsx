import { useTranslation } from "react-i18next";

import { DropZone } from "../../components/DropZone/DropZone";
import type { IntakeKind } from "../../components/DropZone/DropZone";
import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import { GroupedFileList } from "../../components/GroupedFileList/GroupedFileList";
import type { TranslateScanResult } from "../../types/ipc";
import "./TranslateSourcesStep.css";

/** Translate takes subtitles, folders of them, and archives; never video. */
const INTAKE_KINDS: readonly IntakeKind[] = ["folder", "subtitle", "archive"];

interface TranslateSourcesStepProps {
  sources: string[];
  scan: TranslateScanResult | null;
  isScanning: boolean;
  scanError: unknown;
  onBrowseFiles: () => void;
  onBrowseFolder: () => void;
  onRemoveSources: (paths: string[]) => void;
}

/**
 * Step 1: gather sources and preview what the scan found, with a per-file cue
 * count so the size of the coming AI job is visible before any request is
 * sent. The drop zone shows the accepted inputs instead of describing them;
 * the sentence stays for assistive technology only.
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
  onRemoveSources,
}: TranslateSourcesStepProps) {
  const { t } = useTranslation("translate");
  const { t: tError } = useTranslation("errors");
  const totalCues = scan === null ? 0 : scan.files.reduce((sum, file) => sum + file.cueCount, 0);

  return (
    <div className="translate-sources">
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
