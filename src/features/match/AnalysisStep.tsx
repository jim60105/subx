import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { MatchStage } from "../../types/ipc";
import "./AnalysisStep.css";

const STAGES: readonly MatchStage[] = ["scanning", "analyzing", "finalizing"];

interface AnalysisStepProps {
  stage: MatchStage | null;
  error: unknown;
}

/**
 * Step 2: a staged progress indicator, and the failure when there is one.
 *
 * The stages are the backend's own (`scanning → analyzing → finalizing`); the
 * indicator reflects whichever message last arrived. Cancelling and retrying
 * are the wizard's action bar, not this panel.
 */
export function AnalysisStep({ stage, error }: AnalysisStepProps) {
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
      )}

      {failed && (
        <div className="analysis-step__error">
          <ErrorNotice error={error} role="status" />
        </div>
      )}
    </div>
  );
}
