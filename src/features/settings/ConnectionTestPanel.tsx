import { useId } from "react";
import { useTranslation } from "react-i18next";
import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { ConnectionTestResult } from "../../types/ipc";
import type { TestStatus } from "./useSettingsForm";

interface ConnectionTestPanelProps {
  status: TestStatus;
  result: ConnectionTestResult | null;
  /** True while a save or the probe itself is in flight. */
  busy: boolean;
  onTest: () => void;
}

/**
 * The explicit connection test and its outcome.
 *
 * Never fires on its own: the probe is a real request to the configured
 * provider, which on a hosted plan costs the user money. A success is shown
 * beside the button as a dot and the latency; what the test does is the
 * button's accessible description rather than a visible sentence.
 */
export function ConnectionTestPanel({ status, result, busy, onTest }: ConnectionTestPanelProps) {
  const { t } = useTranslation("settings");
  const descriptionId = useId();
  const latency = result?.latencyMs ?? 0;

  return (
    <div className="settings-test">
      <div className="settings-test__action">
        <button
          type="button"
          className="button settings-button"
          disabled={busy}
          aria-describedby={descriptionId}
          onClick={onTest}
        >
          {status === "running" ? t("test.running") : t("test.action")}
        </button>
        <p id={descriptionId} className="visually-hidden">
          {t("test.description")}
        </p>

        {status === "done" && result?.ok && (
          <p className="settings-test__success" role="status">
            <span className="settings-test__dot" aria-hidden="true" />
            <span aria-hidden="true">{t("test.latency", { latency })}</span>
            <span className="visually-hidden">{t("test.success", { latency })}</span>
          </p>
        )}
      </div>

      {status === "done" && result && !result.ok && (
        <ErrorNotice error={result.error} role="alert" />
      )}
    </div>
  );
}
