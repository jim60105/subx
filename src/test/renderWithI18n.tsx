import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import i18n, { initI18n } from "../i18n";
import type { SupportedLanguage } from "../i18n/languages";

/** Initializes the shared i18n instance and switches it to `language`. */
export async function setupI18n(language: SupportedLanguage = "en"): Promise<void> {
  initI18n(language);
  await i18n.changeLanguage(language);
}

export function renderWithI18n(ui: ReactElement) {
  return render(<I18nextProvider i18n={i18n}>{ui}</I18nextProvider>);
}

export { i18n };
