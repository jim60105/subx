import { useTranslation } from "react-i18next";

import { DiffPreview } from "../../components/DiffPreview/DiffPreview";
import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { ConvertFormatDto, ConvertItemDto, ConvertPlanDto } from "../../types/ipc";
import { convertItemLines } from "./planLines";
import "./ConvertOptionsStep.css";

const FORMATS: readonly ConvertFormatDto[] = ["srt", "ass", "vtt", "sub"];

interface ConvertOptionsStepProps {
  targetFormat: ConvertFormatDto | null;
  keepOriginal: boolean;
  plan: ConvertPlanDto | null;
  isPreviewing: boolean;
  previewError: unknown;
  selectedIds: Set<number>;
  onFormatChange: (format: ConvertFormatDto) => void;
  onKeepOriginalChange: (keepOriginal: boolean) => void;
  onToggle: (id: number) => void;
}

interface PlanRowProps {
  item: ConvertItemDto;
  keepOriginal: boolean;
  selected: boolean;
  onToggle: (id: number) => void;
}

function PlanRow({ item, keepOriginal, selected, onToggle }: PlanRowProps) {
  const { t } = useTranslation("convert");
  const { t: tError } = useTranslation("errors");
  const excluded = item.skipReason !== null;

  return (
    // The diff line truncates a long output path; the row's title keeps it reachable.
    <li
      className="convert-options__item"
      data-excluded={excluded ? "true" : undefined}
      title={item.outputPath}
    >
      <label className="convert-options__item-main">
        <input
          type="checkbox"
          checked={selected}
          disabled={excluded}
          aria-label={t("options.selection", { name: item.inputName })}
          onChange={() => onToggle(item.id)}
        />
        <span className="convert-options__item-body">
          <DiffPreview lines={convertItemLines(item, keepOriginal)} label={item.inputName} />
        </span>
        {item.skipReason !== null && (
          <span className="convert-options__flag convert-options__flag--excluded">
            {tError(`codes.${item.skipReason}`)}
          </span>
        )}
        {item.outputExists && (
          <span className="convert-options__flag convert-options__flag--overwrite">
            {t("options.overwrite")}
          </span>
        )}
      </label>
    </li>
  );
}

/**
 * Step 2: choose the target format and see exactly what will be written.
 *
 * Each item is a diff: the output it creates, and its input kept or removed as
 * keep-original says, so the toggle's consequence is visible rather than
 * explained. Every path shown is the one the backend resolved, not a guess
 * re-derived here, and each item carries at most one flag: an exclusion
 * reason, or the warning that it would replace an existing file. Excluded
 * items cannot be selected — the backend refuses them regardless.
 */
export function ConvertOptionsStep({
  targetFormat,
  keepOriginal,
  plan,
  isPreviewing,
  previewError,
  selectedIds,
  onFormatChange,
  onKeepOriginalChange,
  onToggle,
}: ConvertOptionsStepProps) {
  const { t } = useTranslation("convert");

  return (
    <div className="convert-options">
      <h2 className="convert-options__title">{t("options.title")}</h2>

      <div className="convert-options__controls">
        <label className="convert-options__field">
          <span className="convert-options__field-label">{t("options.formatLabel")}</span>
          <select
            className="convert-options__select"
            value={targetFormat ?? ""}
            disabled={targetFormat === null}
            onChange={(event) => onFormatChange(event.target.value as ConvertFormatDto)}
          >
            {FORMATS.map((format) => (
              <option key={format} value={format}>
                {t(`options.formats.${format}`)}
              </option>
            ))}
          </select>
        </label>

        <label className="convert-options__toggle">
          <input
            type="checkbox"
            checked={keepOriginal}
            onChange={(event) => onKeepOriginalChange(event.target.checked)}
          />
          <span className="convert-options__toggle-name">{t("options.keepOriginal")}</span>
        </label>
      </div>

      <p className="convert-options__note">{t("options.encodingNote")}</p>

      {isPreviewing && (
        <p className="convert-options__status" role="status">
          {t("options.previewing")}
        </p>
      )}

      {previewError !== undefined && <ErrorNotice error={previewError} role="status" />}

      {!isPreviewing && plan !== null && (
        <ul className="convert-options__items" aria-label={t("options.listLabel")}>
          {plan.items.map((item) => (
            <PlanRow
              key={item.id}
              item={item}
              keepOriginal={keepOriginal}
              selected={selectedIds.has(item.id)}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
