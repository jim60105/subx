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
 * provider, which on a hosted plan costs the user money.
 */
export function ConnectionTestPanel({ status, result, busy, onTest }: ConnectionTestPanelProps) {
  const { t } = useTranslation("settings");

  return (
    <div className="settings-test">
      <div className="settings-test__action">
        <button type="button" className="settings-button" disabled={busy} onClick={onTest}>
          {status === "running" ? t("test.running") : t("test.action")}
        </button>
        <p className="settings-test__description">{t("test.description")}</p>
      </div>

      {status === "done" && result?.ok && (
        <p className="settings-test__success" role="status">
          {t("test.success", { latency: result.latencyMs ?? 0 })}
        </p>
      )}

      {status === "done" && result && !result.ok && (
        <ErrorNotice error={result.error} role="alert" />
      )}
    </div>
  );
}
