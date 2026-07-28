import { useTranslation } from "react-i18next";
import { ErrorNotice } from "../../components/ErrorNotice/ErrorNotice";
import { AiSettingsSection } from "./AiSettingsSection";
import { ConnectionTestPanel } from "./ConnectionTestPanel";
import { PreferencesSection } from "./PreferencesSection";
import { useSettingsForm } from "./useSettingsForm";
import "./SettingsScreen.css";

/**
 * Settings screen.
 *
 * Two sections that look alike but store nothing alike: the AI configuration
 * is the CLI's own `config.toml`, the preferences below it never leave the GUI.
 */
export function SettingsScreen() {
  const { t } = useTranslation("settings");
  const form = useSettingsForm();

  return (
    <section className="settings">
      <header className="settings__intro">
        <h1 className="settings__heading">{t("title")}</h1>
        <p className="settings__subheading">{t("subtitle")}</p>
      </header>

      <section className="settings-section">
        <header className="settings-section__header">
          <h2 className="settings-section__title">{t("ai.title")}</h2>
          <p className="settings-section__description">{t("ai.description")}</p>
        </header>

        {form.loadError !== undefined && <ErrorNotice error={form.loadError} />}

        {form.config === null ? (
          form.loadError === undefined && <p className="settings__loading">{t("loading")}</p>
        ) : (
          <>
            <AiSettingsSection
              draft={form.draft}
              saved={form.config.ai}
              fieldErrors={form.fieldErrors}
              disabled={form.isSaving}
              onChange={form.setField}
            />

            <div className="settings__actions">
              {form.isDirty && <span className="settings__dirty">{t("unsavedChanges")}</span>}
              <button
                type="button"
                className="settings-button settings-button--primary"
                disabled={!form.isDirty || form.isSaving}
                onClick={() => void form.save()}
              >
                {form.isSaving ? t("actions.saving") : t("actions.save")}
              </button>
            </div>

            {form.saveError !== undefined && <ErrorNotice error={form.saveError} />}

            <ConnectionTestPanel
              status={form.testStatus}
              result={form.testResult}
              busy={form.isSaving || form.testStatus === "running"}
              onTest={() => void form.runConnectionTest()}
            />
          </>
        )}
      </section>

      <section className="settings-section">
        <header className="settings-section__header">
          <h2 className="settings-section__title">{t("preferences.title")}</h2>
          <p className="settings-section__description">{t("preferences.description")}</p>
        </header>
        <PreferencesSection />
      </section>
    </section>
  );
}
