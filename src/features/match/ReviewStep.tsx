import { useTranslation } from "react-i18next";

import type { MatchOperationDto, MatchPlanDto } from "../../types/ipc";
import "./ReviewStep.css";

interface ReviewStepProps {
  plan: MatchPlanDto;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
}

interface OperationRowProps {
  operation: MatchOperationDto;
  selected: boolean;
  onToggle: (id: number) => void;
}

function OperationRow({ operation, selected, onToggle }: OperationRowProps) {
  const { t } = useTranslation("match");

  return (
    <li className="review-step__operation">
      <label className="review-step__operation-main">
        <input
          type="checkbox"
          checked={selected}
          aria-label={t("review.selection", { name: operation.subtitleName })}
          onChange={() => onToggle(operation.id)}
        />
        <span className="review-step__operation-body">
          <span className="review-step__subtitle">{operation.subtitleName}</span>
          <span className="review-step__target">
            {t("review.targetLabel")} <code>{operation.targetPath}</code>
          </span>
        </span>
        <span className="review-step__confidence">
          {t("review.confidence", { value: operation.confidence })}
        </span>
      </label>
      {operation.reasoning.length > 0 && (
        <details className="review-step__reasoning">
          <summary>{t("review.reasoningToggle")}</summary>
          <ul>
            {operation.reasoning.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

/**
 * Step 3: the plan, grouped by video, with per-operation checkboxes and
 * explicit unmatched sections.
 *
 * Videos with at least one match appear as groups; videos and subtitles the
 * analysis matched to nothing are listed separately so nothing silently
 * vanishes. Operations are referenced by id only — the plan itself stays in the
 * backend.
 */
export function ReviewStep({ plan, selectedIds, onToggle }: ReviewStepProps) {
  const { t } = useTranslation("match");
  const hasMatches = plan.videos.length > 0;

  return (
    <div className="review-step">
      <header className="review-step__intro">
        <h2 className="review-step__title">{t("review.title")}</h2>
        <p className="review-step__description">{t("review.description")}</p>
      </header>

      {!hasMatches && <p className="review-step__empty">{t("review.empty")}</p>}

      {plan.videos.map((video) => (
        <section key={video.videoName} className="review-step__group">
          <h3 className="review-step__video">{video.videoName}</h3>
          <ul className="review-step__operations">
            {video.matches.map((operation) => (
              <OperationRow
                key={operation.id}
                operation={operation}
                selected={selectedIds.has(operation.id)}
                onToggle={onToggle}
              />
            ))}
          </ul>
        </section>
      ))}

      {plan.unmatchedVideos.length > 0 && (
        <section className="review-step__unmatched">
          <h3 className="review-step__unmatched-title">{t("review.unmatchedVideos")}</h3>
          <ul>
            {plan.unmatchedVideos.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      )}

      {plan.unmatchedSubtitles.length > 0 && (
        <section className="review-step__unmatched">
          <h3 className="review-step__unmatched-title">{t("review.unmatchedSubtitles")}</h3>
          <ul>
            {plan.unmatchedSubtitles.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
