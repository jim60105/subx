import { useId } from "react";
import { useTranslation } from "react-i18next";

import { OffsetPreview } from "./OffsetPreview";
import "./OffsetField.css";

/** How far one press of a nudge button moves the offset. */
export const NUDGE_STEP_MS = 50;

/** The headline figure: signed seconds to two places, with a typographic minus. */
export function formatSeconds(ms: number): string {
  const digits = Math.abs(ms / 1000).toFixed(2);
  // A value that rounds to zero is shown unsigned, like zero itself.
  if (Number(digits) === 0) return digits;
  return `${ms > 0 ? "+" : "\u2212"}${digits}`;
}

interface OffsetFieldProps {
  offsetMs: number;
  /** The configured limit, or `null` while the configuration is still loading. */
  maxOffsetMs: number | null;
  exceedsMax: boolean;
  onChange: (offsetMs: number) => void;
}

/**
 * The offset control, shared by the method and review steps.
 *
 * It is one field in two places on purpose: in manual mode the number entered
 * here *is* the reviewed value, and in automatic mode detection writes into the
 * very same field the user then edits. Milliseconds are the unit the boundary
 * speaks (design D3), so the input carries them directly and the seconds
 * reading below it is the human-readable echo rather than a second source of
 * truth to keep in step.
 *
 * The seconds figure is the largest element and the nudge buttons sit beside
 * it; the cue-bar preview below shows the direction instead of a sentence. The
 * figure and preview are visual only — the number input, its seconds echo and
 * the sign hint carry the same information to assistive technology.
 */
export function OffsetField({ offsetMs, maxOffsetMs, exceedsMax, onChange }: OffsetFieldProps) {
  const { t } = useTranslation("sync");
  const hintId = useId();

  return (
    <div className="offset-field">
      <div className="offset-field__headline">
        <span className="offset-field__figure serif" aria-hidden="true">
          {formatSeconds(offsetMs)}
        </span>
        <span className="offset-field__unit serif" aria-hidden="true">
          {t("offset.unit")}
        </span>
        <div className="offset-field__nudge">
          <button
            type="button"
            className="button offset-field__nudge-button"
            aria-label={t("offset.decrease", { step: NUDGE_STEP_MS })}
            aria-describedby={hintId}
            onClick={() => onChange(offsetMs - NUDGE_STEP_MS)}
          >
            −
          </button>
          <button
            type="button"
            className="button offset-field__nudge-button"
            aria-label={t("offset.increase", { step: NUDGE_STEP_MS })}
            aria-describedby={hintId}
            onClick={() => onChange(offsetMs + NUDGE_STEP_MS)}
          >
            +
          </button>
        </div>
      </div>
      <OffsetPreview offsetMs={offsetMs} />
      <label className="offset-field__label">
        <span className="offset-field__label-text">{t("offset.label")}</span>
        <input
          type="number"
          className="offset-field__input"
          value={offsetMs}
          step={10}
          aria-invalid={exceedsMax}
          aria-describedby={hintId}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
      <p className="offset-field__seconds visually-hidden">
        {t("offset.seconds", { seconds: (offsetMs / 1000).toFixed(3) })}
      </p>
      <p id={hintId} className="offset-field__hint visually-hidden">
        {t("offset.hint")}
      </p>
      {exceedsMax && maxOffsetMs !== null && (
        <p className="offset-field__error" role="alert">
          {t("offset.exceedsMax", { limit: (maxOffsetMs / 1000).toFixed(1) })}
        </p>
      )}
    </div>
  );
}
