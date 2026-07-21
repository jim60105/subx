import { useTranslation } from "react-i18next";
import { LanguageSelect } from "../LanguageSelect/LanguageSelect";
import { ThemeSelect } from "../ThemeSelect/ThemeSelect";
import "./AppHeader.css";

interface AppHeaderProps {
  /** Rendered only when a feature screen is open. */
  onBack?: () => void;
}

export function AppHeader({ onBack }: AppHeaderProps) {
  const { t } = useTranslation("common");

  return (
    <header className="app-header">
      <div className="app-header__brand">
        {onBack && (
          <button type="button" className="app-header__back" onClick={onBack}>
            <span aria-hidden="true">←</span> {t("actions.back")}
          </button>
        )}
        <span className="app-header__name gradient-text">{t("appName")}</span>
        <span className="app-header__tagline">{t("tagline")}</span>
      </div>

      <div className="app-header__controls">
        <LanguageSelect variant="compact" />
        <ThemeSelect variant="compact" />
      </div>
    </header>
  );
}
