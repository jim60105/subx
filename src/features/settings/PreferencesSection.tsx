import { LanguageSelect } from "../../components/LanguageSelect/LanguageSelect";
import { ThemeSelect } from "../../components/ThemeSelect/ThemeSelect";

/**
 * GUI-only preferences.
 *
 * Renders the shell's shared pickers rather than its own: the header and this
 * screen must behave identically, and both already persist to GUI-local
 * storage. Nothing here reaches the CLI configuration file.
 */
export function PreferencesSection() {
  return (
    <div className="settings-section__fields settings-section__fields--inline">
      <LanguageSelect variant="labeled" />
      <ThemeSelect variant="labeled" />
    </div>
  );
}
