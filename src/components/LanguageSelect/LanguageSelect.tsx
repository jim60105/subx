import { useTranslation } from "react-i18next";
import { changeLanguage } from "../../i18n";
import { SUPPORTED_LANGUAGES } from "../../i18n/languages";
import type { SupportedLanguage } from "../../i18n/languages";
import { PreferenceChoice } from "../PreferenceChoice/PreferenceChoice";
import { PreferenceSelect } from "../PreferenceSelect/PreferenceSelect";

interface LanguageSelectProps {
  /** `compact`: the title bar's dropdown. `inline`: every option shown, for Settings. */
  variant?: "compact" | "inline";
  className?: string;
}

/** Lets the user switch the UI language; wires the shared select to i18next. */
export function LanguageSelect({ variant = "compact", className }: LanguageSelectProps) {
  const { t, i18n } = useTranslation("common");

  const Control = variant === "inline" ? PreferenceChoice : PreferenceSelect;

  return (
    <Control
      label={t("language.label")}
      value={i18n.language}
      options={SUPPORTED_LANGUAGES.map((language) => ({
        value: language,
        label: t(`language.${language}`),
      }))}
      onChange={(value) => void changeLanguage(value as SupportedLanguage)}
      className={className}
    />
  );
}
