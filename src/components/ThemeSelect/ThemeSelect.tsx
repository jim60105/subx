import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemePreference } from "../../theme/themeController";
import { PreferenceSelect } from "../PreferenceSelect/PreferenceSelect";
import type { PreferenceSelectVariant } from "../PreferenceSelect/PreferenceSelect";

const THEME_OPTIONS: ThemePreference[] = ["light", "dark", "system"];

interface ThemeSelectProps {
  variant?: PreferenceSelectVariant;
  className?: string;
}

/** Lets the user override the theme; wires the shared select to the theme controller. */
export function ThemeSelect({ variant, className }: ThemeSelectProps) {
  const { t } = useTranslation("common");
  const { preference, setPreference } = useTheme();

  return (
    <PreferenceSelect
      label={t("theme.label")}
      value={preference}
      options={THEME_OPTIONS.map((option) => ({
        value: option,
        label: t(`theme.${option}`),
      }))}
      onChange={(value) => setPreference(value as ThemePreference)}
      variant={variant}
      className={className}
    />
  );
}
