import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { SyncDefaultsDto, SyncDetectionDto, SyncMethodDto } from "../../types/ipc";
import { OffsetField } from "./OffsetField";
import "./SyncDetectStep.css";

interface SyncDetectStepProps {
  method: SyncMethodDto;
  defaults: SyncDefaultsDto | null;
  isDetecting: boolean;
  detection: SyncDetectionDto | null;
  detectError: unknown;
  offsetMs: number;
  offsetExceedsMax: boolean;
  onOffsetChange: (offsetMs: number) => void;
  onCancel: () => void;
  onRetry: () => void;
}

/**
 * Seconds since the detection began.
 *
 * VAD decodes the whole audio track, so a long episode takes a while with
 * nothing to report in between: the crate exposes no progress hook, and a
 * percentage would be invented. Elapsed time is the one honest thing to show.
 */
function useElapsedSeconds(running: boolean): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!running) {
      setElapsed(0);
      return;
    }
    const started = Date.now();
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [running]);

  return elapsed;
}

/**
 * Step 3: run the detection, then review what to apply.
 *
 * The offset lands in an editable field because fine-tuning it is the feature,
 * not a risk — what gets applied is the reviewed value, whether detection
 * produced it or the user typed it. Confidence and the engine's warnings are
 * shown rather than acted on: a threshold to refuse on would be product policy
 * the crate makes no claim about.
 */
export function SyncDetectStep({
  method,
  defaults,
  isDetecting,
  detection,
  detectError,
  offsetMs,
  offsetExceedsMax,
  onOffsetChange,
  onCancel,
  onRetry,
}: SyncDetectStepProps) {
  const { t } = useTranslation("sync");
  const elapsed = useElapsedSeconds(isDetecting);
  // Manual mode never detects, so its entered value is already the reviewed one.
  const reviewable = method === "manual" || detection !== null;

  return (
    <div className="sync-detect">
      <header className="sync-detect__intro">
        <h2 className="sync-detect__title">{t("detect.title")}</h2>
        <p className="sync-detect__description">{t("detect.description")}</p>
      </header>

      {isDetecting && (
        <div className="sync-detect__running">
          <p className="sync-detect__status" role="status">
            {t("detect.running", { seconds: elapsed })}
          </p>
          <span className="sync-detect__spinner" aria-hidden="true" />
          <button type="button" className="sync-detect__button" onClick={onCancel}>
            {t("detect.cancel")}
          </button>
        </div>
      )}

      {!isDetecting && detectError !== undefined && (
        <div className="sync-detect__error">
          <ErrorNotice error={detectError} role="status" />
          <button
            type="button"
            className="sync-detect__button sync-detect__button--primary"
            onClick={onRetry}
          >
            {t("detect.retry")}
          </button>
        </div>
      )}

      {!isDetecting && detection !== null && (
        <dl className="sync-detect__facts">
          <div className="sync-detect__fact">
            <dt className="sync-detect__fact-name">{t("detect.detected")}</dt>
            <dd className="sync-detect__fact-value">
              {t("offset.seconds", { seconds: (detection.offsetMs / 1000).toFixed(3) })}
            </dd>
          </div>
          <div className="sync-detect__fact">
            <dt className="sync-detect__fact-name">{t("detect.confidence")}</dt>
            <dd className="sync-detect__fact-value">
              {t("detect.confidenceValue", { percent: detection.confidence })}
            </dd>
          </div>
        </dl>
      )}

      {!isDetecting &&
        detection?.warnings.map((warning, index) => (
          <ErrorNotice key={`${warning.code}-${index}`} error={warning} role="status" />
        ))}

      {!isDetecting && reviewable && (
        <OffsetField
          offsetMs={offsetMs}
          maxOffsetMs={defaults?.maxOffsetMs ?? null}
          exceedsMax={offsetExceedsMax}
          onChange={onOffsetChange}
        />
      )}
    </div>
  );
}
