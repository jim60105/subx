/**
 * Theme resolution and persistence.
 *
 * The preference is GUI-only state: it lives in `localStorage` and is never
 * written to the shared CLI configuration file.
 */

/** What the user chose. `system` means "follow the OS preference". */
export type ThemePreference = "light" | "dark" | "system";

/** What is actually rendered, after resolving `system`. */
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "subx.theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function isPreference(value: unknown): value is ThemePreference {
  return value === "light" || value === "dark" || value === "system";
}

/** Reads the persisted preference, defaulting to `system` when unset or invalid. */
export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isPreference(stored) ? stored : "system";
  } catch {
    // Private-mode or disabled storage: fall back to following the system.
    return "system";
  }
}

export function writeThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, preference);
  } catch {
    // Persistence is best-effort; the in-memory preference still applies.
  }
}

/** Current OS preference; assumes light when `matchMedia` is unavailable. */
export function getSystemTheme(): ResolvedTheme {
  return window.matchMedia?.(DARK_QUERY).matches ? "dark" : "light";
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? getSystemTheme() : preference;
}

/** Applies the resolved theme to the document root, which the tokens key off. */
export function applyTheme(theme: ResolvedTheme): void {
  document.documentElement.setAttribute("data-theme", theme);
}

/**
 * Subscribes to OS theme changes. Returns an unsubscribe function; the callback
 * fires on every change regardless of the current preference, so callers decide
 * whether to act on it.
 */
export function subscribeToSystemTheme(listener: (theme: ResolvedTheme) => void): () => void {
  const query = window.matchMedia?.(DARK_QUERY);
  if (!query) {
    return () => {};
  }

  const handler = (event: MediaQueryListEvent) => listener(event.matches ? "dark" : "light");
  query.addEventListener("change", handler);
  return () => query.removeEventListener("change", handler);
}
