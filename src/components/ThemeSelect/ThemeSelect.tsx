import { useTranslation } from "react-i18next";
import { useTheme } from "../../theme/ThemeProvider";
import type { ThemePreference } from "../../theme/themeController";
import { PreferenceChoice } from "../PreferenceChoice/PreferenceChoice";
import { PreferenceSelect } from "../PreferenceSelect/PreferenceSelect";

const THEME_OPTIONS: ThemePreference[] = ["light", "dark", "system"];

interface ThemeSelectProps {
  /** `compact`: the title bar's dropdown. `inline`: every option shown, for Settings. */
  variant?: "compact" | "inline";
  className?: string;
}

/** Lets the user override the theme; wires the shared select to the theme controller. */
export function ThemeSelect({ variant = "compact", className }: ThemeSelectProps) {
  const { t } = useTranslation("common");
  const { preference, setPreference } = useTheme();

  const Control = variant === "inline" ? PreferenceChoice : PreferenceSelect;

  return (
    <Control
      label={t("theme.label")}
      value={preference}
      options={THEME_OPTIONS.map((option) => ({
        value: option,
        label: t(`theme.${option}`),
      }))}
      onChange={(value) => setPreference(value as ThemePreference)}
      className={className}
    />
  );
}
