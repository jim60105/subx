import { useTranslation } from "react-i18next";

import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import type { TranslateItemDto, TranslateOutputModeDto, TranslatePlanDto } from "../../types/ipc";
import "./TranslateOptionsStep.css";

interface TranslateOptionsStepProps {
  plan: TranslatePlanDto | null;
  isPreviewing: boolean;
  previewError: unknown;
  targetLanguage: string;
  sourceLanguage: string;
  context: string;
  glossaryText: string;
  outputMode: TranslateOutputModeDto;
  overwrite: boolean;
  selectedIds: Set<number>;
  onTargetLanguageChange: (value: string) => void;
  onSourceLanguageChange: (value: string) => void;
  onContextChange: (value: string) => void;
  onGlossaryTextChange: (value: string) => void;
  onOutputModeChange: (mode: TranslateOutputModeDto) => void;
  onOverwriteChange: (value: boolean) => void;
  onToggle: (id: number) => void;
}

interface PlanRowProps {
  item: TranslateItemDto;
  selected: boolean;
  onToggle: (id: number) => void;
}

function PlanRow({ item, selected, onToggle }: PlanRowProps) {
  const { t } = useTranslation("translate");
  const { t: tError } = useTranslation("errors");
  const excluded = item.skipReason !== null;
  // Only a runnable item may show "will overwrite": an excluded item's
  // exclusion chip already explains why it will not run (design D4).
  const willOverwrite = item.outputExists && !excluded;

  return (
    <li className="translate-options__item" data-excluded={excluded ? "true" : undefined}>
      <label className="translate-options__item-main">
        <input
          type="checkbox"
          checked={selected}
          disabled={excluded}
          aria-label={t("options.selection", { name: item.inputName })}
          onChange={() => onToggle(item.id)}
        />
        <span className="translate-options__item-body">
          <span className="translate-options__input">{item.inputName}</span>
          <span className="translate-options__output">
            {t("options.outputLabel")} <code>{item.outputPath}</code>
          </span>
          <span className="translate-options__cues">
            {t("options.cueCount", { count: item.cueCount })}
          </span>
        </span>
        {excluded && (
          <span className="translate-options__flag translate-options__flag--excluded">
            {tError(`codes.${item.skipReason}`)}
          </span>
        )}
        {willOverwrite && (
          <span className="translate-options__flag translate-options__flag--overwrite">
            {t("options.overwrite")}
          </span>
        )}
      </label>
    </li>
  );
}

/**
 * Step 2: language, glossary and output settings, with the exact plan the
 * options currently produce shown below — every option, including the
 * free-text ones, re-previews immediately (design: cheap, AI-free filesystem
 * calls, so the plan the user is about to authorize is never stale).
 */
export function TranslateOptionsStep({
  plan,
  isPreviewing,
  previewError,
  targetLanguage,
  sourceLanguage,
  context,
  glossaryText,
  outputMode,
  overwrite,
  selectedIds,
  onTargetLanguageChange,
  onSourceLanguageChange,
  onContextChange,
  onGlossaryTextChange,
  onOutputModeChange,
  onOverwriteChange,
  onToggle,
}: TranslateOptionsStepProps) {
  const { t } = useTranslation("translate");

  return (
    <div className="translate-options">
      <header className="translate-options__intro">
        <h2 className="translate-options__title">{t("options.title")}</h2>
        <p className="translate-options__description">{t("options.description")}</p>
      </header>

      <div className="translate-options__controls">
        <label className="translate-options__field">
          <span className="translate-options__field-label">{t("options.targetLanguageLabel")}</span>
          <input
            type="text"
            className="translate-options__input-text"
            value={targetLanguage}
            placeholder={t("options.targetLanguagePlaceholder")}
            onChange={(event) => onTargetLanguageChange(event.target.value)}
          />
        </label>

        <label className="translate-options__field">
          <span className="translate-options__field-label">{t("options.sourceLanguageLabel")}</span>
          <input
            type="text"
            className="translate-options__input-text"
            value={sourceLanguage}
            placeholder={t("options.sourceLanguagePlaceholder")}
            onChange={(event) => onSourceLanguageChange(event.target.value)}
          />
        </label>

        <label className="translate-options__field translate-options__field--wide">
          <span className="translate-options__field-label">{t("options.contextLabel")}</span>
          <textarea
            className="translate-options__textarea"
            value={context}
            placeholder={t("options.contextPlaceholder")}
            onChange={(event) => onContextChange(event.target.value)}
          />
        </label>

        <label className="translate-options__field translate-options__field--wide">
          <span className="translate-options__field-label">{t("options.glossaryLabel")}</span>
          <textarea
            className="translate-options__textarea"
            value={glossaryText}
            placeholder={t("options.glossaryPlaceholder")}
            onChange={(event) => onGlossaryTextChange(event.target.value)}
          />
          <span className="translate-options__field-hint">{t("options.glossaryHint")}</span>
        </label>
      </div>

      <fieldset className="translate-options__mode">
        <legend className="translate-options__field-label">{t("options.mode.label")}</legend>
        <label className="translate-options__radio">
          <input
            type="radio"
            name="translate-output-mode"
            checked={outputMode === "suffix"}
            onChange={() => onOutputModeChange("suffix")}
          />
          {t("options.mode.suffix")}
        </label>
        <label className="translate-options__radio">
          <input
            type="radio"
            name="translate-output-mode"
            checked={outputMode === "replace"}
            onChange={() => onOutputModeChange("replace")}
          />
          {t("options.mode.replace")}
        </label>
        {outputMode === "replace" && (
          <p className="translate-options__mode-note">{t("options.mode.replaceNote")}</p>
        )}
        {outputMode === "suffix" && (
          <label className="translate-options__toggle">
            <input
              type="checkbox"
              checked={overwrite}
              onChange={(event) => onOverwriteChange(event.target.checked)}
            />
            <span className="translate-options__toggle-body">
              <span className="translate-options__toggle-name">{t("options.overwriteToggle")}</span>
              <span className="translate-options__toggle-hint">{t("options.overwriteHint")}</span>
            </span>
          </label>
        )}
      </fieldset>

      <p className="translate-options__note">{t("options.terminologyNote")}</p>

      {isPreviewing && (
        <p className="translate-options__status" role="status">
          {t("options.previewing")}
        </p>
      )}

      {previewError !== undefined && <ErrorNotice error={previewError} role="status" />}

      {!isPreviewing && plan !== null && (
        <ul className="translate-options__items" aria-label={t("options.listLabel")}>
          {plan.items.map((item) => (
            <PlanRow
              key={item.id}
              item={item}
              selected={selectedIds.has(item.id)}
              onToggle={onToggle}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
