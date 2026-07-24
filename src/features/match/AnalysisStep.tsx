import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import { isErrorDto } from "../../types/ipc";
import type { MatchStage } from "../../types/ipc";
import "./AnalysisStep.css";

const STAGES: readonly MatchStage[] = ["scanning", "analyzing", "finalizing"];

interface AnalysisStepProps {
  stage: MatchStage | null;
  error: unknown;
  onCancel: () => void;
  onRetry: () => void;
  onOpenSettings: () => void;
}

/** Whether the failure is a missing AI provider, which links to Settings. */
function isNotConfigured(error: unknown): boolean {
  return isErrorDto(error) && error.code === "match.ai_not_configured";
}

/**
 * Step 2: a staged progress indicator, cancellable, with error recovery.
 *
 * The stages are the backend's own (`scanning → analyzing → finalizing`); the
 * indicator reflects whichever message last arrived. On failure it offers a
 * retry, and — when no AI provider is configured — a direct route to Settings.
 */
export function AnalysisStep({ stage, error, onCancel, onRetry, onOpenSettings }: AnalysisStepProps) {
  const { t } = useTranslation("match");
  const activeIndex = stage === null ? -1 : STAGES.indexOf(stage);
  const failed = error !== undefined;

  return (
    <div className="analysis-step">
      <header className="analysis-step__intro">
        <h2 className="analysis-step__title">{t("analysis.title")}</h2>
        <p className="analysis-step__description">{t("analysis.description")}</p>
      </header>

      {!failed && (
        <>
          <ol className="analysis-step__stages">
            {STAGES.map((entry, index) => {
              const state =
                index < activeIndex ? "done" : index === activeIndex ? "active" : "upcoming";
              return (
                <li key={entry} className="analysis-step__stage" data-state={state}>
                  {t(`analysis.stages.${entry}`)}
                </li>
              );
            })}
          </ol>
          <div className="analysis-step__actions">
            <button type="button" className="analysis-step__button" onClick={onCancel}>
              {t("analysis.cancel")}
            </button>
          </div>
        </>
      )}

      {failed && (
        <div className="analysis-step__error">
          <ErrorNotice error={error} role="status" />
          <div className="analysis-step__actions">
            {isNotConfigured(error) && (
              <button
                type="button"
                className="analysis-step__button analysis-step__button--primary"
                onClick={onOpenSettings}
              >
                {t("analysis.openSettings")}
              </button>
            )}
            <button type="button" className="analysis-step__button" onClick={onRetry}>
              {t("analysis.retry")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
