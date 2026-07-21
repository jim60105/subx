import { useTranslation } from "react-i18next";
import { changeLanguage } from "../../i18n";
import { SUPPORTED_LANGUAGES } from "../../i18n/languages";
import type { SupportedLanguage } from "../../i18n/languages";
import { PreferenceSelect } from "../PreferenceSelect/PreferenceSelect";
import type { PreferenceSelectVariant } from "../PreferenceSelect/PreferenceSelect";

interface LanguageSelectProps {
  variant?: PreferenceSelectVariant;
  className?: string;
}

/** Lets the user switch the UI language; wires the shared select to i18next. */
export function LanguageSelect({ variant, className }: LanguageSelectProps) {
  const { t, i18n } = useTranslation("common");

  return (
    <PreferenceSelect
      label={t("language.label")}
      value={i18n.language}
      options={SUPPORTED_LANGUAGES.map((language) => ({
        value: language,
        label: t(`language.${language}`),
      }))}
      onChange={(value) => void changeLanguage(value as SupportedLanguage)}
      variant={variant}
      className={className}
    />
  );
}
