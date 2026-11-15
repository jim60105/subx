/**
 * Dev-only review harness entry: renders one view in a chosen theme and
 * language so a person (or a headless browser) can judge it outside Tauri.
 *
 *   ?view=<name>  one entry of VIEWS; omitted → a list of links to every view
 *   ?theme=light|dark
 *   ?lang=en|zh-TW
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { mockIPC, mockWindows } from "@tauri-apps/api/mocks";
import { initI18n } from "../../src/i18n";
import { SUPPORTED_LANGUAGES, resolveInitialLanguage } from "../../src/i18n/languages";
import { BUILD_INFO, CONFIG, SYNC_DEFAULTS } from "../../src/test/screenFixtures";
import { ThemeProvider } from "../../src/theme/ThemeProvider";
import { THEME_STORAGE_KEY } from "../../src/theme/themeController";
import "../../src/styles/global.css";
import "../../src/App.css";
import { VIEWS } from "./views";

const params = new URLSearchParams(window.location.search);
const view = params.get("view");
const theme = params.get("theme");
const lang = params.get("lang");

// Before mounting, so ThemeProvider reads the requested theme on first render.
if (theme === "light" || theme === "dark") window.localStorage.setItem(THEME_STORAGE_KEY, theme);

// Outside Tauri there is no backend; answer the read-only commands the shell
// issues on mount with the same fixtures the tests use.
mockWindows("main");
mockIPC((command) => {
  if (command === "get_build_info") return structuredClone(BUILD_INFO);
  if (command === "get_config") return structuredClone(CONFIG);
  if (command === "get_sync_defaults") return structuredClone(SYNC_DEFAULTS);
  return null;
});

const language = SUPPORTED_LANGUAGES.find((supported) => supported === lang);
initI18n(language ?? resolveInitialLanguage());

function Index() {
  const query = (name: string) => {
    const next = new URLSearchParams(params);
    next.set("view", name);
    return `?${next.toString()}`;
  };
  return (
    <ul>
      {Object.keys(VIEWS).map((name) => (
        <li key={name}>
          <a href={query(name)}>{name}</a>
        </li>
      ))}
    </ul>
  );
}

function Preview() {
  if (view === null || !(view in VIEWS)) return <Index />;
  const View = VIEWS[view];
  // The app view brings its own shell; a step needs the shell's main frame.
  if (view === "app") return <View />;
  return (
    <div className="app">
      <main className="app__main">
        <View />
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <Preview />
    </ThemeProvider>
  </React.StrictMode>,
);
