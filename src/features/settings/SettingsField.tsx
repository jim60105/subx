import type { ReactNode } from "react";
import { useLocalizedError } from "../../i18n/useLocalizedError";

/** Attributes every control must spread so the label and error stay wired to it. */
export interface FieldControlProps {
  id: string;
  "aria-invalid"?: boolean;
  "aria-describedby"?: string;
}

interface SettingsFieldProps {
  id: string;
  label: string;
  /** Static guidance, shown whether or not the field is in error. */
  hint?: ReactNode;
  /** Raw command rejection for this field; localized here. */
  error?: unknown;
  children: (control: FieldControlProps) => ReactNode;
}

/**
 * One labeled form field with its inline validation error.
 *
 * The control is supplied by the caller but its identity and ARIA wiring are
 * not: they come from here as `control` props, so no field can accidentally
 * lose the association between its label, its input and its error text.
 */
export function SettingsField({ id, label, hint, error, children }: SettingsFieldProps) {
  const localizeError = useLocalizedError();
  const localized = error === undefined ? undefined : localizeError(error);

  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [hint ? hintId : undefined, localized ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="settings-field">
      <label className="settings-field__label" htmlFor={id}>
        {label}
      </label>

      {children({
        id,
        "aria-invalid": localized ? true : undefined,
        "aria-describedby": describedBy || undefined,
      })}

      {hint && (
        <p className="settings-field__hint" id={hintId}>
          {hint}
        </p>
      )}

      {localized && (
        <p className="settings-field__error" id={errorId} role="alert">
          <span className="settings-field__error-message">{localized.message}</span>
          {localized.hint && <span className="settings-field__error-hint">{localized.hint}</span>}
          {!localized.isKnown && (
            <span className="settings-field__error-detail">{localized.detail}</span>
          )}
        </p>
      )}
    </div>
  );
}
