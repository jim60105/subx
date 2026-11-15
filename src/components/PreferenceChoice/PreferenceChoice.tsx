import { useId } from "react";
import type { PreferenceSelectOption } from "../PreferenceSelect/PreferenceSelect";
import "./PreferenceChoice.css";

interface PreferenceChoiceProps {
  /** The group's accessible name, shown as its legend. */
  label: string;
  value: string;
  options: PreferenceSelectOption[];
  onChange: (value: string) => void;
  className?: string;
}

/**
 * A preference with every option laid out inline as a single-choice group.
 *
 * The inline counterpart of `PreferenceSelect`, for screens with room to show
 * all choices at once (Settings). Native radios carry the semantics and the
 * arrow-key behaviour; they are visually hidden, and the label text itself is
 * what the user sees and clicks.
 */
export function PreferenceChoice({ label, value, options, onChange, className }: PreferenceChoiceProps) {
  const groupName = useId();

  return (
    <fieldset className={["preference-choice", className].filter(Boolean).join(" ")}>
      <legend className="preference-choice__label">{label}</legend>
      <div className="preference-choice__options">
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label key={option.value} className="preference-choice__option" data-checked={checked}>
              <input
                type="radio"
                className="visually-hidden"
                name={groupName}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
