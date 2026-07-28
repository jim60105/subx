import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { LanguageSelect } from "../LanguageSelect/LanguageSelect";
import { ThemeSelect } from "../ThemeSelect/ThemeSelect";
import { WindowControls } from "../WindowControls/WindowControls";
import { SettingsIcon } from "../icons/SettingsIcon";
import "./AppHeader.css";

interface AppHeaderProps {
  /**
   * Makes the brand block the way home. Left undefined on the home hub itself,
   * where the brand is plain text — a control that re-enters the screen already
   * shown is noise.
   */
  onNavigateHome?: () => void;
  /** Rendered on every screen except settings itself. */
  onOpenSettings?: () => void;
}

export function AppHeader({ onNavigateHome, onOpenSettings }: AppHeaderProps) {
  const { t } = useTranslation("common");
  const brand = (
    <>
      <span className="app-header__name gradient-text">{t("appName")}</span>
      <span className="app-header__tagline">{t("tagline")}</span>
    </>
  );

  return (
    <header
      className="app-header"
      data-tauri-drag-region
      onDoubleClick={(e) => {
        // Only toggle maximize when clicking the header itself (the drag region),
        // not when double-clicking interactive children.
        if (e.target === e.currentTarget || (e.target as HTMLElement).hasAttribute("data-tauri-drag-region")) {
          try {
            getCurrentWindow().toggleMaximize();
          } catch {
            // ignore in non-Tauri test environments
          }
        }
      }}
    >
      {onNavigateHome ? (
        <button
          type="button"
          className="app-header__brand app-header__brand--link"
          title={t("actions.home")}
          onClick={onNavigateHome}
        >
          {brand}
          {/* Appended rather than an `aria-label`, which would replace the
              visible name and leave voice control with nothing to say. */}
          <span className="visually-hidden">{t("actions.home")}</span>
        </button>
      ) : (
        <div className="app-header__brand">{brand}</div>
      )}

      <div className="app-header__controls">
        <LanguageSelect variant="compact" />
        <ThemeSelect variant="compact" />
        {onOpenSettings && (
          <button
            type="button"
            className="app-header__settings"
            title={t("actions.settings")}
            aria-label={t("actions.settings")}
            onClick={onOpenSettings}
          >
            <SettingsIcon />
          </button>
        )}
        <div className="app-header__separator" aria-hidden="true" />
        <WindowControls />
      </div>
    </header>
  );
}
