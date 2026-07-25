import { useTranslation } from "react-i18next";

import "./SyncInputsStep.css";

interface SyncInputsStepProps {
  mediaPath: string | null;
  subtitlePath: string | null;
  onBrowseMedia: () => void;
  onBrowseSubtitle: () => void;
  onClearMedia: () => void;
  onClearSubtitle: () => void;
}

/** The last path segment, for a readable label of a long absolute path. */
function basename(path: string): string {
  const segments = path.split(/[\\/]/).filter(Boolean);
  return segments[segments.length - 1] ?? path;
}

interface SlotProps {
  kind: "media" | "subtitle";
  path: string | null;
  onBrowse: () => void;
  onClear: () => void;
}

function Slot({ kind, path, onBrowse, onClear }: SlotProps) {
  const { t } = useTranslation("sync");

  return (
    <div className="sync-inputs__slot">
      <span className="sync-inputs__slot-label">{t(`inputs.${kind}.label`)}</span>
      <p className="sync-inputs__slot-hint">{t(`inputs.${kind}.hint`)}</p>
      {path === null ? (
        <p className="sync-inputs__slot-empty">{t(`inputs.${kind}.empty`)}</p>
      ) : (
        <p className="sync-inputs__slot-chosen" title={path}>
          {basename(path)}
        </p>
      )}
      <div className="sync-inputs__slot-actions">
        <button type="button" className="sync-inputs__button" onClick={onBrowse}>
          {t(`inputs.${kind}.browse`)}
        </button>
        {path !== null && (
          <button type="button" className="sync-inputs__clear" onClick={onClear}>
            {t(`inputs.${kind}.clear`)}
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * Step 1: choose the pair to work on.
 *
 * Exactly one media file and one subtitle — this flow is single-pair by design
 * (batch directory sync is deferred to its own proposal). The subtitle is the
 * only requirement: without a media file there is nothing for voice-activity
 * detection to listen to, so the flow narrows to a manual offset, which Step 2
 * says plainly rather than leaving a disabled control unexplained.
 */
export function SyncInputsStep({
  mediaPath,
  subtitlePath,
  onBrowseMedia,
  onBrowseSubtitle,
  onClearMedia,
  onClearSubtitle,
}: SyncInputsStepProps) {
  const { t } = useTranslation("sync");

  return (
    <div className="sync-inputs">
      <header className="sync-inputs__intro">
        <h2 className="sync-inputs__title">{t("inputs.title")}</h2>
        <p className="sync-inputs__description">{t("inputs.description")}</p>
      </header>

      <p className="sync-inputs__dropzone">{t("inputs.dropzone")}</p>

      <div className="sync-inputs__slots">
        <Slot
          kind="media"
          path={mediaPath}
          onBrowse={onBrowseMedia}
          onClear={onClearMedia}
        />
        <Slot
          kind="subtitle"
          path={subtitlePath}
          onBrowse={onBrowseSubtitle}
          onClear={onClearSubtitle}
        />
      </div>

      {subtitlePath !== null && mediaPath === null && (
        <p className="sync-inputs__note" role="status">
          {t("inputs.subtitleOnly")}
        </p>
      )}
    </div>
  );
}
