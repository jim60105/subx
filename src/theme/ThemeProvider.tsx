import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  subscribeToSystemTheme,
  writeThemePreference,
} from "./themeController";
import type { ResolvedTheme, ThemePreference } from "./themeController";

interface ThemeContextValue {
  /** What the user chose, including `system`. */
  preference: ThemePreference;
  /** What is currently rendered. */
  theme: ResolvedTheme;
  setPreference: (preference: ThemePreference) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [preference, setPreferenceState] = useState<ThemePreference>(() => readThemePreference());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() => resolveTheme("system"));

  // Follow the OS preference live; the effect on `theme` below decides whether
  // the change is visible, so returning to `system` resumes following at once.
  useEffect(() => subscribeToSystemTheme(setSystemTheme), []);

  const theme: ResolvedTheme = preference === "system" ? systemTheme : preference;

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setPreference = useCallback((next: ThemePreference) => {
    writeThemePreference(next);
    setPreferenceState(next);
  }, []);

  const value = useMemo(
    () => ({ preference, theme, setPreference }),
    [preference, theme, setPreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
