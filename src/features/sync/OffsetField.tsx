import { useTranslation } from "react-i18next";

import "./OffsetField.css";

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
 */
export function OffsetField({ offsetMs, maxOffsetMs, exceedsMax, onChange }: OffsetFieldProps) {
  const { t } = useTranslation("sync");

  return (
    <div className="offset-field">
      <label className="offset-field__label">
        <span className="offset-field__label-text">{t("offset.label")}</span>
        <input
          type="number"
          className="offset-field__input"
          value={offsetMs}
          step={10}
          aria-invalid={exceedsMax}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </label>
      <p className="offset-field__seconds">
        {t("offset.seconds", { seconds: (offsetMs / 1000).toFixed(3) })}
      </p>
      <p className="offset-field__hint">{t("offset.hint")}</p>
      {exceedsMax && maxOffsetMs !== null && (
        <p className="offset-field__error" role="alert">
          {t("offset.exceedsMax", { limit: (maxOffsetMs / 1000).toFixed(1) })}
        </p>
      )}
    </div>
  );
}
