import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { MinimizeIcon, MaximizeIcon, RestoreIcon, CloseIcon } from "../icons/WindowIcons";
import "./WindowControls.css";

/**
 * Tracks whether the Tauri window is currently maximized.
 *
 * Listens for `onResized` events and re-checks `isMaximized()` after each one.
 * The Tauri `unlisten` callback is stored and called during cleanup to prevent
 * memory leaks. Exported separately for testability.
 */
export function useWindowMaximized(): boolean {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let unlistenFn: (() => void) | undefined;

    try {
      const appWindow = getCurrentWindow();

      if (appWindow?.isMaximized) {
        appWindow.isMaximized()
          .then((val) => {
            if (!cancelled) setMaximized(val);
          })
          .catch(() => {});
      }

      if (appWindow?.onResized) {
        appWindow.onResized(async () => {
          try {
            const val = await appWindow.isMaximized();
            if (!cancelled) setMaximized(val);
          } catch {
            // ignore
          }
        })
          .then((unlisten) => {
            unlistenFn = unlisten;
          })
          .catch(() => {});
      }
    } catch {
      // Fallback for non-Tauri test environments
    }

    return () => {
      cancelled = true;
      if (unlistenFn) {
        unlistenFn();
      }
    };
  }, []);

  return maximized;
}

/** Frameless window control strip rendered inside `AppHeader`. */
export function WindowControls() {
  const { t } = useTranslation("common");
  const maximized = useWindowMaximized();

  const handleMinimize = () => {
    try {
      getCurrentWindow().minimize();
    } catch {
      // ignore in non-Tauri environment
    }
  };

  const handleToggleMaximize = () => {
    try {
      getCurrentWindow().toggleMaximize();
    } catch {
      // ignore in non-Tauri environment
    }
  };

  const handleClose = () => {
    try {
      getCurrentWindow().close();
    } catch {
      // ignore in non-Tauri environment
    }
  };

  return (
    <div className="window-controls" role="group" aria-label={t("titlebar.group")}>
      {/* Minimize */}
      <button
        type="button"
        className="window-controls__btn"
        title={t("titlebar.minimize")}
        aria-label={t("titlebar.minimize")}
        onClick={handleMinimize}
      >
        <MinimizeIcon />
      </button>

      {/* Maximize / Restore */}
      <button
        type="button"
        className="window-controls__btn"
        title={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
        aria-label={maximized ? t("titlebar.restore") : t("titlebar.maximize")}
        onClick={handleToggleMaximize}
      >
        {maximized ? <RestoreIcon /> : <MaximizeIcon />}
      </button>

      {/* Close */}
      <button
        type="button"
        className="window-controls__btn window-controls__btn--close"
        title={t("titlebar.close")}
        aria-label={t("titlebar.close")}
        onClick={handleClose}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
