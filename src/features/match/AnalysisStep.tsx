import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { MatchStage, SourceScanResult } from "../../types/ipc";
import { AnalysisIllustration } from "./AnalysisIllustration";
import "./AnalysisStep.css";

const STAGES: readonly MatchStage[] = ["scanning", "analyzing", "finalizing"];

interface AnalysisStepProps {
  stage: MatchStage | null;
  error: unknown;
  /** The Step 1 scan; its two totals are the only data this step shows. */
  scan: SourceScanResult | null;
}

/**
 * Step 2: three stage words, the scan totals, and a decorative illustration —
 * or the failure when there is one.
 *
 * The stages are the backend's own (`scanning → analyzing → finalizing`); the
 * words reflect whichever message last arrived. The backend reports nothing
 * finer, so the illustration beneath them never claims progress. Cancelling
 * and retrying are the wizard's action bar, not this panel.
 */
export function AnalysisStep({ stage, error, scan }: AnalysisStepProps) {
  const { t } = useTranslation("match");
  const activeIndex = stage === null ? -1 : STAGES.indexOf(stage);
  const failed = error !== undefined;

  return (
    <div className="analysis-step">
      <h2 className="visually-hidden">{t("analysis.title")}</h2>

      {!failed && (
        <>
          <ol className="analysis-step__stages">
            {STAGES.map((entry, index) => {
              const state =
                index < activeIndex ? "done" : index === activeIndex ? "active" : "upcoming";
              return (
                <li
                  key={entry}
                  className="analysis-step__stage serif"
                  data-state={state}
                  aria-current={state === "active" ? "step" : undefined}
                >
                  {t(`analysis.stages.${entry}`)}
                </li>
              );
            })}
          </ol>
          {scan !== null && (
            <p className="analysis-step__totals">
              <span className="analysis-step__tally">
                <span className="analysis-step__figure serif">{scan.videoCount}</span>{" "}
                {t("sources.scan.videoLabel", { count: scan.videoCount })}
              </span>
              <span className="analysis-step__tally">
                <span className="analysis-step__figure serif">{scan.subtitleCount}</span>{" "}
                {t("sources.scan.subtitleLabel", { count: scan.subtitleCount })}
              </span>
            </p>
          )}
          <AnalysisIllustration stage={stage} />
        </>
      )}

      {failed && (
        <div className="analysis-step__error">
          <ErrorNotice error={error} role="status" />
        </div>
      )}
    </div>
  );
}
