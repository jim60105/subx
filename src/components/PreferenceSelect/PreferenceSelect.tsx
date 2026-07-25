import { useEffect, useId, useRef, useState, type ReactNode } from "react";
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
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectId = useId();

  const selectedOption = options.find((opt) => opt.value === value) || options[0];

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  const classes = ["preference-select", `preference-select--${variant}`, className]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={containerRef} className={classes}>
      <label
        htmlFor={selectId}
        className={variant === "compact" ? "visually-hidden" : "preference-select__label"}
      >
        {label}
      </label>
      <div className="preference-select__control">
        {/* Hidden native select for accessibility & automated tests */}
        <select
          id={selectId}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          aria-label={label}
          className="preference-select__native-select"
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>

        {/* Custom trigger button */}
        <button
          type="button"
          className="preference-select__trigger"
          onClick={() => setIsOpen((prev) => !prev)}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
        >
          <span className="preference-select__value">{selectedOption?.label}</span>
          <span className="preference-select__arrow" aria-hidden="true">
            <svg
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </span>
        </button>

        {/* Custom themed DOM popover */}
        {isOpen && (
          <div className="preference-select__menu" role="listbox">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`preference-select__option ${
                  option.value === value ? "preference-select__option--selected" : ""
                }`}
                role="option"
                aria-selected={option.value === value}
                onClick={() => {
                  onChange(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
