import { useTranslation } from "react-i18next";

import { DropZone } from "../../components/DropZone/DropZone";
import type { IntakeKind } from "../../components/DropZone/DropZone";
import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { TranslateScanResult } from "../../types/ipc";
import { TranslateSourceLedger } from "./TranslateSourceLedger";
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
 * Step 1: gather sources and preview what the scan found, in one ledger with
 * a per-file cue count so the size of the coming AI job is visible before any
 * request is sent. The drop zone shows the accepted inputs instead of
 * describing them; the sentence stays for assistive technology only.
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
        <TranslateSourceLedger
          sources={sources}
          scan={scan}
          isScanning={isScanning}
          onRemoveSources={onRemoveSources}
        />
      )}

      {scanError !== undefined && <ErrorNotice error={scanError} role="status" />}
    </div>
  );
}
