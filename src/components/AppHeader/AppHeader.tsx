import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { commands } from "../../types/bindings";
import type { VersionInfoDto } from "../../types/ipc";
import { LanguageSelect } from "../LanguageSelect/LanguageSelect";
import { ThemeSelect } from "../ThemeSelect/ThemeSelect";
import { WindowControls } from "../WindowControls/WindowControls";
import { formatVersionLabel } from "./formatVersionLabel";
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
  /**
   * Localized title of the current screen, shown after the brand as the
   * breadcrumb's last segment. Undefined on the home hub, which needs none.
   */
  currentTitle?: string;
}

export function AppHeader({ onNavigateHome, onOpenSettings, currentTitle }: AppHeaderProps) {
  const { t } = useTranslation("common");
  const [buildInfo, setBuildInfo] = useState<VersionInfoDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    void commands
      .getBuildInfo()
      .then((info) => {
        if (!cancelled) setBuildInfo(info);
      })
      .catch(() => {
        if (!cancelled) setBuildInfo(null);
      });

    return () => {
      cancelled = true;
    };
  }, []);

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
      <nav className="app-header__crumb" aria-label={t("breadcrumb")}>
        {onNavigateHome ? (
          <button
            type="button"
            className="app-header__brand app-header__brand--link serif"
            title={t("actions.home")}
            onClick={onNavigateHome}
          >
            <span className="app-header__name">{t("appName")}</span>
            {/* Appended rather than an `aria-label`, which would replace the
                visible name and leave voice control with nothing to say. */}
            <span className="visually-hidden">{t("actions.home")}</span>
          </button>
        ) : (
          <div className="app-header__brand serif">
            <span className="app-header__name">{t("appName")}</span>
          </div>
        )}
        {currentTitle !== undefined && (
          <>
            <span className="app-header__slash" aria-hidden="true">
              /
            </span>
            <span className="app-header__current serif" aria-current="page">
              {currentTitle}
            </span>
          </>
        )}
      </nav>

      {buildInfo !== null && (
        <span className="app-header__version">
          <span className="visually-hidden">{t("version")} </span>
          {formatVersionLabel(buildInfo.version, buildInfo.gitHash)}
        </span>
      )}

      <div className="app-header__controls">
        <LanguageSelect variant="compact" />
        <ThemeSelect variant="compact" />
        {onOpenSettings && (
          <button type="button" className="app-header__settings" onClick={onOpenSettings}>
            {t("actions.settings")}
          </button>
        )}
        <div className="app-header__separator" aria-hidden="true" />
        <WindowControls />
      </div>
    </header>
  );
}
