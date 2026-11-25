import { useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";

import { baseName } from "../../platform/fileKind";
import type { MatchPlanDto } from "../../types/ipc";
import { groupOperationsByLanguage, platformLanguageName } from "./languageGroups";
import {
  buildLedger,
  filterLedger,
  ledgerCounts,
  meterSegments,
  METER_SEGMENTS,
  REVIEW_FILTERS,
} from "./reviewLedger";
import type { LedgerRow, ReviewFilter } from "./reviewLedger";
import "./ReviewStep.css";

interface ReviewStepProps {
  plan: MatchPlanDto;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
  onToggleLanguage: (ids: number[]) => void;
}

interface PairRowProps {
  row: Extract<LedgerRow, { kind: "pair" }>;
  selected: boolean;
  onToggle: (id: number) => void;
}

/** Nested controls that keep their own click behavior inside a pairing row. */
const ROW_CONTROLS = "input, summary, button, a, select, textarea, label";

/** Pointer travel, in CSS pixels on either axis, that counts as a drag. */
const DRAG_THRESHOLD = 4;

function PairRow({ row, selected, onToggle }: PairRowProps) {
  const { t } = useTranslation("match");
  const { operation } = row;
  const filled = meterSegments(operation.confidence);
  const press = useRef<{ x: number; y: number } | null>(null);

  // A pointer-only shortcut: the checkbox stays the single keyboard and
  // assistive-technology control, so the row gets no role or tab stop
  // (design D3). Clicks a nested control synthesizes, including keyboard
  // activation, are left to that control.
  const handleClick = (event: MouseEvent<HTMLLIElement>) => {
    const control = (event.target as Element).closest(ROW_CONTROLS);
    if (control !== null && event.currentTarget.contains(control)) return;
    // Both signals are needed: a moved pointer alone may be a shaky click,
    // and a selection alone may predate this click or come from a double click.
    const start = press.current;
    const moved =
      start !== null &&
      (Math.abs(event.clientX - start.x) > DRAG_THRESHOLD || Math.abs(event.clientY - start.y) > DRAG_THRESHOLD);
    if (moved && window.getSelection()?.isCollapsed === false) return;
    onToggle(operation.id);
  };

  return (
    <li
      className="review-ledger__row"
      data-kind="pair"
      data-low={row.low ? "true" : undefined}
      onMouseDown={(event) => {
        press.current = { x: event.clientX, y: event.clientY };
      }}
      onClick={handleClick}
    >
      <input
        type="checkbox"
        checked={selected}
        aria-label={t("review.selection", { name: operation.subtitleName })}
        onChange={() => onToggle(operation.id)}
      />
      <span className="review-ledger__video" title={row.videoName}>
        {/* A repeated name is dropped from sight only; every row still
            tells assistive technology which video it belongs to. */}
        {row.showVideoName ? row.videoName : <span className="visually-hidden">{row.videoName}</span>}
      </span>
      <span className="review-ledger__join" aria-hidden="true" />
      <div className="review-ledger__subtitle">
        <div className="review-ledger__from">
          {operation.language !== null && (
            <span className="review-ledger__lang">{operation.language.toUpperCase()}</span>
          )}
          <span className="review-ledger__name" title={operation.subtitleName}>
            {operation.subtitleName}
          </span>
        </div>
        <div className="review-ledger__to" title={operation.targetPath}>
          <span aria-hidden="true">→ </span>
          <span className="visually-hidden">{t("review.targetLabel")} </span>
          {baseName(operation.targetPath)}
        </div>
        {operation.reasoning.length > 0 &&
          (row.low ? (
            <ul className="review-ledger__why">
              {operation.reasoning.map((reason, index) => (
                <li key={index}>{reason}</li>
              ))}
            </ul>
          ) : (
            <details className="review-ledger__reasoning">
              <summary>{t("review.reasoningToggle")}</summary>
              <ul>
                {operation.reasoning.map((reason, index) => (
                  <li key={index}>{reason}</li>
                ))}
              </ul>
            </details>
          ))}
      </div>
      {row.low ? (
        <span className="review-ledger__confidence">
          <span className="review-ledger__meter" aria-hidden="true">
            {Array.from({ length: METER_SEGMENTS }, (_, index) => (
              <i key={index} data-on={index < filled ? "true" : undefined} />
            ))}
          </span>
          <span className="review-ledger__figure">
            {t("review.confidence", { value: operation.confidence })}
          </span>
        </span>
      ) : (
        <span />
      )}
    </li>
  );
}

function UnmatchedRow({ row }: { row: Exclude<LedgerRow, { kind: "pair" }> }) {
  const { t } = useTranslation("match");

  if (row.kind === "unmatchedVideo") {
    return (
      <li className="review-ledger__row" data-kind="unmatched-video">
        <span />
        <span className="review-ledger__video" title={row.name}>
          {row.name}
        </span>
        <span className="review-ledger__join" aria-hidden="true" />
        <span className="review-ledger__slot" role="img" aria-label={t("review.noSubtitle")} />
        <span />
      </li>
    );
  }

  return (
    <li className="review-ledger__row" data-kind="unmatched-subtitle">
      <span />
      <span className="review-ledger__slot" role="img" aria-label={t("review.noVideo")} />
      <span className="review-ledger__join" aria-hidden="true" />
      <div className="review-ledger__subtitle">
        <span className="review-ledger__name" title={row.name}>
          {row.name}
        </span>
      </div>
      <span />
    </li>
  );
}

/**
 * Step 3: the plan as a ledger, one row per pairing in plan order, with
 * unmatched videos and subtitles after the pairings.
 *
 * Filters only change which rows are displayed; selection belongs to the
 * wizard and the count beside the primary action always describes the whole
 * plan, so a hidden row is never silently included or dropped. Operations are
 * referenced by id only — the plan itself stays in the backend.
 */
export function ReviewStep({ plan, selectedIds, onToggle, onToggleLanguage }: ReviewStepProps) {
  const { t, i18n } = useTranslation("match");
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const rows = useMemo(() => buildLedger(plan), [plan]);
  const counts = ledgerCounts(rows);
  const visibleRows = filterLedger(rows, filter);
  const languageGroups = groupOperationsByLanguage(plan);
  const firstUnmatched = filter === "all" ? visibleRows.findIndex((row) => row.kind !== "pair") : -1;

  return (
    <div className="review-step">
      <h2 className="visually-hidden">{t("review.title")}</h2>

      <div className="review-step__toolbar">
        <div className="review-step__filters" role="group" aria-label={t("review.filterLabel")}>
          {REVIEW_FILTERS.map((option) => (
            <button
              key={option}
              type="button"
              className="review-step__filter"
              data-filter={option}
              aria-pressed={filter === option}
              onClick={() => setFilter(option)}
            >
              {t(`review.filters.${option}`)}{" "}
              <span className="review-step__filter-count serif">{counts[option]}</span>
            </button>
          ))}
        </div>

        {languageGroups.length > 0 && (
          <div className="review-step__languages" role="group" aria-label={t("review.languageBarLabel")}>
            {languageGroups.map((group) => {
              let selectedCount = 0;
              for (const id of group.operationIds) {
                if (selectedIds.has(id)) selectedCount += 1;
              }
              const checked =
                selectedCount === group.operationIds.length
                  ? true
                  : selectedCount > 0
                    ? "mixed"
                    : false;
              const language =
                group.code === null
                  ? t("review.languages.other")
                  : // A hand-written label wins; the platform names any other code.
                    t(`review.languages.${group.code}`, {
                      defaultValue: platformLanguageName(group.code, i18n.language),
                    });

              return (
                <button
                  key={group.code ?? "other"}
                  type="button"
                  className="review-step__language"
                  role="checkbox"
                  aria-checked={checked}
                  aria-label={t("review.languageSelection", {
                    language,
                    count: group.operationIds.length,
                  })}
                  onClick={() => onToggleLanguage(group.operationIds)}
                >
                  <span>{language}</span>
                  <span className="review-step__language-count" aria-hidden="true">
                    {group.operationIds.length}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {counts.all === 0 && <p className="review-step__empty">{t("review.empty")}</p>}
      {counts.all > 0 && visibleRows.length === 0 && (
        <p className="review-step__empty">{t("review.filterEmpty")}</p>
      )}

      {/* An empty named list would only be noise for a screen reader. */}
      {visibleRows.length > 0 && (
        <ul className="review-ledger" aria-label={t("review.ledgerLabel")}>
          {visibleRows.map((row, index) => (
            <LedgerItem
              key={row.key}
              row={row}
              sectionStart={index === firstUnmatched}
              selectedIds={selectedIds}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface LedgerItemProps {
  row: LedgerRow;
  /** The first unmatched row under "all", preceded by a section label. */
  sectionStart: boolean;
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
}

function LedgerItem({ row, sectionStart, selectedIds, onToggle }: LedgerItemProps) {
  const { t } = useTranslation("match");

  if (row.kind === "pair") {
    return <PairRow row={row} selected={selectedIds.has(row.operation.id)} onToggle={onToggle} />;
  }

  return (
    <>
      {sectionStart && (
        <li className="review-ledger__section" aria-hidden="true">
          {t("review.filters.unmatched")}
        </li>
      )}
      <UnmatchedRow row={row} />
    </>
  );
}
