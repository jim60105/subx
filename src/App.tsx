import { useState } from "react";
import { AppHeader } from "./components/AppHeader/AppHeader";
import { HomeScreen } from "./features/home/HomeScreen";
import { MatchScreen } from "./features/match/MatchScreen";
import { SettingsScreen } from "./features/settings/SettingsScreen";
import type { ScreenId } from "./navigation/screens";
import "./App.css";

export default function App() {
  const [screen, setScreen] = useState<ScreenId>("home");

  return (
    <div className="app">
      <AppHeader
        onBack={screen === "home" ? undefined : () => setScreen("home")}
        onOpenSettings={screen === "settings" ? undefined : () => setScreen("settings")}
      />
      <main className="app__main">
        {screen === "home" && <HomeScreen onOpenTask={setScreen} />}
        {screen === "match" && <MatchScreen onOpenSettings={() => setScreen("settings")} />}
        {screen === "settings" && <SettingsScreen />}
      </main>
    </div>
  );
}
