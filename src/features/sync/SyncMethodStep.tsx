import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { SyncDefaultsDto, SyncMethodDto } from "../../types/ipc";
import { OffsetField } from "./OffsetField";
import "./SyncMethodStep.css";

interface SyncMethodStepProps {
  method: SyncMethodDto;
  /** Automatic detection is unavailable without a media file to listen to. */
  hasMedia: boolean;
  defaults: SyncDefaultsDto | null;
  defaultsError: unknown;
  sensitivity: number | null;
  offsetMs: number;
  offsetExceedsMax: boolean;
  onMethodChange: (method: SyncMethodDto) => void;
  onSensitivityChange: (sensitivity: number) => void;
  onOffsetChange: (offsetMs: number) => void;
}

/**
 * Step 2: how the offset is obtained.
 *
 * Both controls are seeded from the shared configuration and neither writes to
 * it: the sensitivity travels with the one detection it belongs to, and the
 * maximum offset is read only to validate against. That validation is repeated
 * by the backend at apply time — this copy exists so the user finds out before
 * running anything, not because it is the boundary.
 */
export function SyncMethodStep({
  method,
  hasMedia,
  defaults,
  defaultsError,
  sensitivity,
  offsetMs,
  offsetExceedsMax,
  onMethodChange,
  onSensitivityChange,
  onOffsetChange,
}: SyncMethodStepProps) {
  const { t } = useTranslation("sync");

  return (
    <div className="sync-method">
      <header className="sync-method__intro">
        <h2 className="sync-method__title">{t("method.title")}</h2>
        <p className="sync-method__description">{t("method.description")}</p>
      </header>

      {defaultsError !== undefined && <ErrorNotice error={defaultsError} role="status" />}

      <fieldset className="sync-method__choices">
        <legend className="sync-method__legend">{t("method.legend")}</legend>

        <label className="sync-method__choice">
          <input
            type="radio"
            name="sync-method"
            value="auto"
            checked={method === "auto"}
            disabled={!hasMedia}
            onChange={() => onMethodChange("auto")}
          />
          <span className="sync-method__choice-body">
            <span className="sync-method__choice-name">{t("method.auto.name")}</span>
            <span className="sync-method__choice-hint">{t("method.auto.hint")}</span>
            {!hasMedia && (
              <span className="sync-method__choice-blocked">{t("method.auto.needsMedia")}</span>
            )}
          </span>
        </label>

        <label className="sync-method__choice">
          <input
            type="radio"
            name="sync-method"
            value="manual"
            checked={method === "manual"}
            onChange={() => onMethodChange("manual")}
          />
          <span className="sync-method__choice-body">
            <span className="sync-method__choice-name">{t("method.manual.name")}</span>
            <span className="sync-method__choice-hint">{t("method.manual.hint")}</span>
          </span>
        </label>
      </fieldset>

      {method === "auto" && (
        <div className="sync-method__panel">
          <label className="sync-method__sensitivity">
            <span className="sync-method__sensitivity-label">{t("method.sensitivity.label")}</span>
            <input
              type="range"
              className="sync-method__slider"
              min={0}
              max={100}
              step={5}
              value={sensitivity ?? 50}
              disabled={defaults === null}
              onChange={(event) => onSensitivityChange(Number(event.target.value))}
            />
            <span className="sync-method__sensitivity-value">
              {t("method.sensitivity.value", { percent: sensitivity ?? 0 })}
            </span>
          </label>
          <p className="sync-method__sensitivity-hint">{t("method.sensitivity.hint")}</p>
          <p className="sync-method__sensitivity-note">{t("method.sensitivity.perRun")}</p>
        </div>
      )}

      {method === "manual" && (
        <div className="sync-method__panel">
          <OffsetField
            offsetMs={offsetMs}
            maxOffsetMs={defaults?.maxOffsetMs ?? null}
            exceedsMax={offsetExceedsMax}
            onChange={onOffsetChange}
          />
        </div>
      )}
    </div>
  );
}
