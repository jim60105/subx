import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { describe, expect, it } from "vitest";
import { setPrefersDark } from "../test/matchMedia";
import { ThemeProvider, useTheme } from "./ThemeProvider";
import { THEME_STORAGE_KEY, readThemePreference } from "./themeController";

function ThemeProbe() {
  const { preference, theme, setPreference } = useTheme();
  return (
    <div>
      <span data-testid="preference">{preference}</span>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setPreference("light")}>
        light
      </button>
      <button type="button" onClick={() => setPreference("system")}>
        system
      </button>
    </div>
  );
}

function renderProbe() {
  return render(
    <ThemeProvider>
      <ThemeProbe />
    </ThemeProvider>,
  );
}

describe("theme controller", () => {
  it("follows the system preference when no override is stored", () => {
    setPrefersDark(true);
    renderProbe();

    expect(screen.getByTestId("preference")).toHaveTextContent("system");
    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("reflects a system preference change while following the system", () => {
    setPrefersDark(false);
    renderProbe();
    expect(screen.getByTestId("theme")).toHaveTextContent("light");

    act(() => setPrefersDark(true));

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
  });

  it("persists a manual override and ignores the system preference", async () => {
    setPrefersDark(true);
    renderProbe();

    await userEvent.click(screen.getByRole("button", { name: "light" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(readThemePreference()).toBe("light");
  });

  it("restores a persisted override on the next launch", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    setPrefersDark(true);
    renderProbe();

    expect(screen.getByTestId("theme")).toHaveTextContent("light");
  });

  it("resumes following the system after returning to follow-system", async () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "light");
    setPrefersDark(true);
    renderProbe();
    expect(screen.getByTestId("theme")).toHaveTextContent("light");

    await userEvent.click(screen.getByRole("button", { name: "system" }));

    expect(screen.getByTestId("theme")).toHaveTextContent("dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("falls back to following the system when the stored value is invalid", () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, "chartreuse");
    expect(readThemePreference()).toBe("system");
  });
});
