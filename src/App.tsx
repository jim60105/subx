import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AppHeader } from "./components/AppHeader/AppHeader";
import { ConvertScreen } from "./features/convert/ConvertScreen";
import { HomeScreen } from "./features/home/HomeScreen";
import { MatchScreen } from "./features/match/MatchScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import { SyncScreen } from "./features/sync/SyncScreen";
import { TranslateScreen } from "./features/translate/TranslateScreen";
import type { ScreenId } from "./navigation/screens";
import "./App.css";

/** The breadcrumb title of every screen but the hub, which shows none. */
const TITLE_KEYS: Record<Exclude<ScreenId, "home">, string> = {
  match: "home:tasks.match.name",
  convert: "home:tasks.convert.name",
  sync: "home:tasks.sync.name",
  translate: "home:tasks.translate.name",
  settings: "settings:title",
};

export default function App() {
  const { t } = useTranslation();
  const [screen, setScreen] = useState<ScreenId>("home");

  return (
    <div className="app">
      <AppHeader
        onNavigateHome={screen === "home" ? undefined : () => setScreen("home")}
        onOpenSettings={screen === "settings" ? undefined : () => setScreen("settings")}
        currentTitle={screen === "home" ? undefined : t(TITLE_KEYS[screen])}
      />
      <main className="app__main">
        {screen === "home" && <HomeScreen onOpenTask={setScreen} />}
        {screen === "match" && <MatchScreen onOpenSettings={() => setScreen("settings")} />}
        {screen === "convert" && <ConvertScreen />}
        {screen === "sync" && <SyncScreen />}
        {screen === "translate" && (
          <TranslateScreen onOpenSettings={() => setScreen("settings")} />
        )}
        {screen === "settings" && <SettingsScreen />}
      </main>
    </div>
  );
}
