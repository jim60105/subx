import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

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
  /** A caution shown under the row and added to the field's description, such as why Continue is unavailable. */
  notice?: string;
  /** Shown at the inline end of the row, such as the detection facts. */
  children?: ReactNode;
}

/**
 * The offset control of the offset step: one row of the seconds figure, the
 * nudge buttons, the millisecond field and whatever the step puts at its end.
 *
 * Milliseconds are the unit the boundary speaks (design D3), so the input
 * carries them directly and the seconds figure is the human-readable echo
 * rather than a second source of truth to keep in step.
 *
 * The figure is visual only and moves in the direction of each change; the
 * number input, its seconds echo and the sign hint carry the same information
 * to assistive technology.
 */
export function OffsetField({ offsetMs, maxOffsetMs, exceedsMax, onChange, notice, children }: OffsetFieldProps) {
  const { t } = useTranslation("sync");
  const hintId = useId();
  const noticeId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // Arriving with a notice means the control that brought the user here
  // (Skip, Keep) has just become a disabled Continue, which leaves keyboard
  // focus nowhere useful. Hand it to the field the notice is about, unless the
  // user has already put focus somewhere real. Mount only: a notice that
  // appears while editing never moves focus.
  const noticeOnMount = useRef(notice !== undefined);
  useEffect(() => {
    if (!noticeOnMount.current) return;
    const active = document.activeElement;
    if (active !== null && active !== document.body && !active.matches(":disabled")) return;
    inputRef.current?.focus();
  }, []);

  // The direction of the last change; none until the value first changes.
  const [previousMs, setPreviousMs] = useState(offsetMs);
  const [direction, setDirection] = useState<"up" | "down" | undefined>(undefined);
  if (offsetMs !== previousMs) {
    setPreviousMs(offsetMs);
    setDirection(offsetMs > previousMs ? "up" : "down");
  }

  return (
    <div className="offset-field">
      <div className="offset-field__row">
        <span className="offset-field__reading" aria-hidden="true">
          {/* A new element per value restarts the motion. */}
          <span key={offsetMs} className="offset-field__figure serif" data-direction={direction}>
            {formatSeconds(offsetMs)}
          </span>
          <span className="offset-field__unit serif">{t("offset.unit")}</span>
        </span>
        <div className="offset-field__nudge">
          <button
            type="button"
            className="button offset-field__nudge-button"
            aria-label={t("offset.decrease", { step: NUDGE_STEP_MS })}
            aria-describedby={hintId}
            onClick={() => onChange(offsetMs - NUDGE_STEP_MS)}
          >
            {t("offset.nudgeDown", { step: NUDGE_STEP_MS })}
          </button>
          <button
            type="button"
            className="button offset-field__nudge-button"
            aria-label={t("offset.increase", { step: NUDGE_STEP_MS })}
            aria-describedby={hintId}
            onClick={() => onChange(offsetMs + NUDGE_STEP_MS)}
          >
            {t("offset.nudgeUp", { step: NUDGE_STEP_MS })}
          </button>
        </div>
        <label className="offset-field__label">
          <span className="visually-hidden">{t("offset.label")}</span>
          <input
            type="number"
            className="offset-field__input"
            value={offsetMs}
            step={10}
            aria-invalid={exceedsMax}
            ref={inputRef}
            aria-describedby={notice === undefined ? hintId : `${hintId} ${noticeId}`}
            onChange={(event) => onChange(Number(event.target.value))}
          />
          <span className="offset-field__input-unit" aria-hidden="true">
            {t("offset.msUnit")}
          </span>
        </label>
        {children !== undefined && children !== null && children !== false && (
          <div className="offset-field__end">{children}</div>
        )}
      </div>
      <p className="offset-field__seconds visually-hidden">
        {t("offset.seconds", { seconds: (offsetMs / 1000).toFixed(3) })}
      </p>
      <p id={hintId} className="offset-field__hint visually-hidden">
        {t("offset.hint")}
      </p>
      {/* The status region stays mounted, empty and out of the layout, so a
          notice that appears while editing is a change to an existing live
          region, which screen readers announce; a region inserted already
          filled often is not. */}
      <p
        id={noticeId}
        className={notice === undefined ? "visually-hidden" : "offset-field__notice"}
        role="status"
      >
        {notice}
      </p>
      {exceedsMax && maxOffsetMs !== null && (
        <p className="offset-field__error" role="alert">
          {t("offset.exceedsMax", { limit: (maxOffsetMs / 1000).toFixed(1) })}
        </p>
      )}
    </div>
  );
}
