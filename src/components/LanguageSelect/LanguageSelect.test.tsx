import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LANGUAGE_STORAGE_KEY } from "../../i18n/languages";
import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { LanguageSelect } from "./LanguageSelect";

describe("LanguageSelect", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  it("lists every supported language with the active one selected", () => {
    renderWithI18n(<LanguageSelect />);

    const select = screen.getByLabelText("Language") as HTMLSelectElement;
    expect(select.value).toBe("en");
    expect(screen.getByRole("option", { name: "正體中文" })).toBeInTheDocument();
  });

  it("switches the language at runtime and persists the choice", async () => {
    renderWithI18n(<LanguageSelect />);

    await userEvent.selectOptions(screen.getByLabelText("Language"), "zh-TW");

    expect(await screen.findByLabelText("語言")).toBeInTheDocument();
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh-TW");
  });
});
