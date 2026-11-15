import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { setPrefersDark } from "../../test/matchMedia";
import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { THEME_STORAGE_KEY } from "../../theme/themeController";
import { ThemeSelect } from "./ThemeSelect";

function renderThemeSelect() {
  return renderWithI18n(
    <ThemeProvider>
      <ThemeSelect />
    </ThemeProvider>,
  );
}

describe("ThemeSelect", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  it("reflects the current preference, defaulting to follow-system", () => {
    setPrefersDark(true);
    renderThemeSelect();

    expect((screen.getByLabelText("Theme") as HTMLSelectElement).value).toBe("system");
  });

  it("switches the theme and persists the override", async () => {
    setPrefersDark(true);
    renderThemeSelect();

    await userEvent.selectOptions(screen.getByLabelText("Theme"), "light");

    expect(document.documentElement).toHaveAttribute("data-theme", "light");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
  });

  it("lays every option out inline in the inline variant", async () => {
    setPrefersDark(false);
    renderWithI18n(
      <ThemeProvider>
        <ThemeSelect variant="inline" />
      </ThemeProvider>,
    );

    expect(screen.getByRole("group", { name: "Theme" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Follow system" })).toBeChecked();

    await userEvent.click(screen.getByRole("radio", { name: "Dark" }));

    expect(document.documentElement).toHaveAttribute("data-theme", "dark");
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });
});
