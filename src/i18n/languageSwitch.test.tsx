import { act, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { HomeScreen } from "../features/home/HomeScreen";
import { renderWithI18n, setupI18n } from "../test/renderWithI18n";
import { changeLanguage } from "./index";
import { LANGUAGE_STORAGE_KEY } from "./languages";

describe("runtime language switching", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  // @covers localization/runtime-language-switching-with-persistence#immediate-switch
  it("re-renders visible strings in the new language and persists the choice", async () => {
    renderWithI18n(<HomeScreen onOpenTask={() => {}} />);
    expect(screen.getByRole("heading", { name: "What would you like to do?" })).toBeInTheDocument();

    await act(() => changeLanguage("zh-TW"));

    await waitFor(() => {
      expect(screen.getByRole("heading", { name: "你想做什麼？" })).toBeInTheDocument();
    });
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh-TW");
  });
});
