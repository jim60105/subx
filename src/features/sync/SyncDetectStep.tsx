import { useEffect, useId, useState } from "react";
import type { CSSProperties } from "react";
import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { SyncDefaultsDto } from "../../types/ipc";
import type { DetectPhase } from "./useSyncWizard";
import "./SyncDetectStep.css";

interface SyncDetectStepProps {
  phase: DetectPhase;
  /** Automatic detection is unavailable without a media file to listen to. */
  hasMedia: boolean;
  defaults: SyncDefaultsDto | null;
  defaultsError: unknown;
  sensitivity: number | null;
  detectError: unknown;
  onSensitivityChange: (sensitivity: number) => void;
}

/** How many bars the waiting illustration draws. */
const BAR_COUNT = 48;

/**
 * Fixed heights for the illustration's bars, a shape that reads as speech
 * without claiming to be the file's audio. It never changes, so it is computed
 * once rather than on every elapsed-second render.
 */
const BARS: readonly CSSProperties[] = Array.from({ length: BAR_COUNT }, (_, i) => ({
  "--h": (Math.abs(Math.sin(i * 0.37) * Math.cos(i * 0.113)) * 0.8 + 0.08).toFixed(3),
  // Staggers the listening animation so the bars do not move in unison.
  "--n": i % 23,
}) as CSSProperties);

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

const INTRO_KEY: Record<DetectPhase, string> = {
  ask: "ask",
  detecting: "running",
  failed: "failed",
};

/**
 * Step 2: whether to detect the offset, the wait while it runs, and a failure.
 *
 * Every choice — start, skip, keep, retry, cancel — is the wizard's action bar;
 * this step only shows the state. The sensitivity control is seeded from the
 * shared configuration and never writes to it: the value travels with the one
 * detection it belongs to. The illustration is decorative and the same in all
 * three states; only while detecting does it move.
 */
export function SyncDetectStep({
  phase,
  hasMedia,
  defaults,
  defaultsError,
  sensitivity,
  detectError,
  onSensitivityChange,
}: SyncDetectStepProps) {
  const { t } = useTranslation("sync");
  const sensitivityHintId = useId();
  const detecting = phase === "detecting";
  const elapsed = useElapsedSeconds(detecting);
  const intro = INTRO_KEY[phase];

  return (
    <div className="sync-detect">
      <header className="sync-detect__intro">
        <div className="sync-detect__lede">
          <h2 className="sync-detect__title">{t(`detect.${intro}.title`)}</h2>
          <p className="sync-detect__description">{t(`detect.${intro}.description`)}</p>
        </div>
        {detecting && (
          <p className="sync-detect__clock serif" role="status">
            {t("detect.elapsed", { seconds: elapsed })}
          </p>
        )}
      </header>

      {defaultsError !== undefined && <ErrorNotice error={defaultsError} role="status" />}

      <div className="sync-detect__instrument" aria-hidden="true" data-listening={detecting}>
        {BARS.map((style, index) => (
          <span key={index} className="sync-detect__bar" style={style} />
        ))}
      </div>

      {phase === "failed" && <ErrorNotice error={detectError} role="status" />}

      {!detecting && !hasMedia && (
        <p className="sync-detect__needs-media">{t("detect.needsMedia")}</p>
      )}

      {!detecting && hasMedia && (
        <div className="sync-detect__panel">
          <label className="sync-detect__sensitivity">
            <span className="sync-detect__sensitivity-label">{t("detect.sensitivity.label")}</span>
            {/* The end labels replace the sentence that explained the scale;
                they are visual, and the sentence stays as the description. */}
            <span className="sync-detect__track">
              <input
                type="range"
                className="sync-detect__slider"
                min={0}
                max={100}
                step={5}
                value={sensitivity ?? 50}
                disabled={defaults === null}
                aria-describedby={sensitivityHintId}
                onChange={(event) => onSensitivityChange(Number(event.target.value))}
              />
              <span className="sync-detect__ends" aria-hidden="true">
                <span>{t("detect.sensitivity.low")}</span>
                <span>{t("detect.sensitivity.high")}</span>
              </span>
            </span>
            <span className="sync-detect__sensitivity-value">
              {t("detect.sensitivity.value", { percent: sensitivity ?? 0 })}
            </span>
          </label>
          <p id={sensitivityHintId} className="visually-hidden">
            {t("detect.sensitivity.hint")}
          </p>
          <p className="sync-detect__sensitivity-note">{t("detect.sensitivity.perRun")}</p>
        </div>
      )}
    </div>
  );
}
