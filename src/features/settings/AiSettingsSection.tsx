import { useTranslation } from "react-i18next";
import type { AiConfigDto } from "../../types/ipc";
import { SettingsField } from "./SettingsField";
import { AI_PROVIDERS } from "./settingsApi";
import type { AiField } from "./settingsApi";
import type { AiDraft, FieldErrors } from "./useSettingsForm";

interface AiSettingsSectionProps {
  draft: AiDraft;
  /** Last values read from disk; supplies the API key's masked placeholder. */
  saved: AiConfigDto;
  fieldErrors: FieldErrors;
  disabled: boolean;
  onChange: (field: AiField, value: string) => void;
}

/** The AI half of the shared CLI configuration, as an editable form. */
export function AiSettingsSection({
  draft,
  saved,
  fieldErrors,
  disabled,
  onChange,
}: AiSettingsSectionProps) {
  const { t } = useTranslation("settings");

  return (
    <div className="settings-section__fields">
      <SettingsField id="ai-provider" label={t("ai.provider.label")} error={fieldErrors.provider}>
        {(control) => (
          <select
            {...control}
            className="settings-control"
            value={draft.provider}
            disabled={disabled}
            onChange={(event) => onChange("provider", event.target.value)}
          >
            {/* A value written outside the GUI may not be one we offer; show it
                rather than silently snapping the user onto a different provider. */}
            {!AI_PROVIDERS.includes(draft.provider as (typeof AI_PROVIDERS)[number]) && (
              <option value={draft.provider}>{draft.provider}</option>
            )}
            {AI_PROVIDERS.map((provider) => (
              <option key={provider} value={provider}>
                {t(`ai.provider.options.${provider}`)}
              </option>
            ))}
          </select>
        )}
      </SettingsField>

      <SettingsField id="ai-model" label={t("ai.model.label")} error={fieldErrors.model}>
        {(control) => (
          <input
            {...control}
            className="settings-control"
            type="text"
            spellCheck={false}
            autoComplete="off"
            placeholder={t("ai.model.placeholder")}
            value={draft.model}
            disabled={disabled}
            onChange={(event) => onChange("model", event.target.value)}
          />
        )}
      </SettingsField>

      <SettingsField id="ai-base-url" label={t("ai.baseUrl.label")} error={fieldErrors.baseUrl}>
        {(control) => (
          <input
            {...control}
            className="settings-control"
            type="url"
            spellCheck={false}
            autoComplete="off"
            placeholder={t("ai.baseUrl.placeholder")}
            value={draft.baseUrl}
            disabled={disabled}
            onChange={(event) => onChange("baseUrl", event.target.value)}
          />
        )}
      </SettingsField>

      <SettingsField
        id="ai-api-key"
        label={t("ai.apiKey.label")}
        hint={t("ai.apiKey.hint")}
        error={fieldErrors.apiKey}
      >
        {(control) => (
          <input
            {...control}
            className="settings-control"
            type="password"
            spellCheck={false}
            autoComplete="off"
            /* Empty by default and never pre-filled: the stored key is
               write-only, so the mask is a placeholder, not a value. */
            placeholder={saved.apiKeySet ? saved.apiKeyMasked : t("ai.apiKey.unsetPlaceholder")}
            value={draft.apiKey}
            disabled={disabled}
            onChange={(event) => onChange("apiKey", event.target.value)}
          />
        )}
      </SettingsField>
    </div>
  );
}
