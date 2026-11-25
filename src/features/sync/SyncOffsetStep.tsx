import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { SyncDefaultsDto, SyncDetectionDto } from "../../types/ipc";
import { OffsetField } from "./OffsetField";
import { SyncPlayer } from "./SyncPlayer";
import { usePreviewSession } from "./usePreviewSession";
import type { PreviewSession } from "./usePreviewSession";
import "./SyncOffsetStep.css";

interface SyncOffsetFieldsProps {
  defaults: SyncDefaultsDto | null;
  /** The detection behind the offset, or `null` when detection was skipped. */
  detection: SyncDetectionDto | null;
  offsetMs: number;
  offsetExceedsMax: boolean;
  onOffsetChange: (offsetMs: number) => void;
}

interface SyncOffsetViewProps extends SyncOffsetFieldsProps {
  session: PreviewSession;
}

interface SyncOffsetStepProps extends SyncOffsetFieldsProps {
  /** The media to preview against, or `null` when only a subtitle was chosen. */
  mediaPath: string | null;
  subtitlePath: string | null;
}

/**
 * Step 3: the one place the offset is edited.
 *
 * The offset lands in an editable field because fine-tuning it is the feature,
 * not a risk — what gets applied is the reviewed value, whether detection
 * produced it or the user typed it. Confidence and the engine's warnings are
 * shown rather than acted on: a threshold to refuse on would be product policy
 * the crate makes no claim about. The configured limit is checked here so the
 * user finds out before saving; the backend repeats it at apply time.
 *
 * The preview above the field plays the media with the shifted subtitle over
 * it. No preview state blocks editing the offset or continuing.
 */
export function SyncOffsetStep({ mediaPath, subtitlePath, ...fields }: SyncOffsetStepProps) {
  const session = usePreviewSession(mediaPath, subtitlePath);
  return <SyncOffsetView session={session} {...fields} />;
}

/** The step's markup for a given preview session; the review harness renders it with fixtures. */
export function SyncOffsetView({
  session,
  defaults,
  detection,
  offsetMs,
  offsetExceedsMax,
  onOffsetChange,
}: SyncOffsetViewProps) {
  const { t } = useTranslation("sync");

  return (
    <div className="sync-offset">
      <header className="sync-offset__intro">
        <h2 className="sync-offset__title">{t("offset.title")}</h2>
        <p className="sync-offset__description">{t("offset.description")}</p>
      </header>

      {detection !== null && (
        <dl className="sync-offset__facts">
          <div className="sync-offset__fact">
            <dt className="sync-offset__fact-name">{t("offset.detected")}</dt>
            <dd className="sync-offset__fact-value">
              {t("offset.seconds", { seconds: (detection.offsetMs / 1000).toFixed(3) })}
            </dd>
          </div>
          <div className="sync-offset__fact">
            <dt className="sync-offset__fact-name">{t("offset.confidence")}</dt>
            <dd className="sync-offset__fact-value">
              {t("offset.confidenceValue", { percent: detection.confidence })}
            </dd>
          </div>
        </dl>
      )}

      {detection?.warnings.map((warning, index) => (
        <ErrorNotice key={`${warning.code}-${index}`} error={warning} role="status" />
      ))}

      <SyncPlayer session={session} offsetMs={offsetMs} />

      {session.cueError !== undefined && <ErrorNotice error={session.cueError} role="status" />}

      <OffsetField
        offsetMs={offsetMs}
        maxOffsetMs={defaults?.maxOffsetMs ?? null}
        exceedsMax={offsetExceedsMax}
        onChange={onOffsetChange}
      />
    </div>
  );
}
