import { useTranslation } from "react-i18next";
import "./MatchScreen.css";

/**
 * Placeholder for the match feature.
 *
 * The shell foundation only establishes the route; the four-step wizard that
 * fills it (built on `WizardShell`) arrives with the `add-match-wizard` change.
 */
export function MatchScreen() {
  const { t } = useTranslation(["home", "common"]);

  return (
    <section className="feature-placeholder">
      <h1 className="feature-placeholder__title">{t("tasks.match.name")}</h1>
      <p className="feature-placeholder__status">{t("common:featurePlaceholder.title")}</p>
      <p className="feature-placeholder__description">
        {t("common:featurePlaceholder.description")}
      </p>
    </section>
  );
}
