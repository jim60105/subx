import type { ReactNode } from "react";
import "./PreferenceSelect.css";

export interface PreferenceSelectOption {
  value: string;
  label: ReactNode;
}

/** `compact` hides the label visually (header chrome); `labeled` shows it (settings field). */
export type PreferenceSelectVariant = "compact" | "labeled";

interface PreferenceSelectProps {
  /** Accessible name, always present in the DOM regardless of variant. */
  label: string;
  value: string;
  options: PreferenceSelectOption[];
  onChange: (value: string) => void;
  variant?: PreferenceSelectVariant;
  className?: string;
}

/**
 * The single rendering-and-wiring implementation behind every GUI-only
 * preference control (theme, language, and any later one). Domain-specific
 * wrappers such as `LanguageSelect` and `ThemeSelect` supply only their own
 * options and change handler; every surface that shows a preference picker —
 * the header, the settings screen — renders through this component, so they
 * can never drift apart on markup or accessibility behaviour.
 */
export function PreferenceSelect({
  label,
  value,
  options,
  onChange,
  variant = "compact",
  className,
}: PreferenceSelectProps) {
  const classes = ["preference-select", `preference-select--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={classes}>
      <span className={variant === "compact" ? "visually-hidden" : "preference-select__label"}>
        {label}
      </span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
