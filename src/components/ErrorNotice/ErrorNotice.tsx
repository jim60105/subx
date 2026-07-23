import { useTranslation } from "react-i18next";
import { useLocalizedError } from "../../i18n/useLocalizedError";
import "./ErrorNotice.css";

interface ErrorNoticeProps {
  /** Raw command rejection; localized here. */
  error: unknown;
  /** `alert` interrupts assistive tech; `status` is for awaited results. */
  role?: "alert" | "status";
  className?: string;
}

/**
 * A failed operation, presented in full: localized cause, recovery hint, and
 * the backend's raw English message behind a disclosure.
 *
 * Used wherever an error owns its own block of the screen. Errors that belong
 * to a single form field are rendered inline by that field instead.
 */
export function ErrorNotice({ error, role = "alert", className }: ErrorNoticeProps) {
  const { t } = useTranslation("errors");
  const localizeError = useLocalizedError();
  const localized = localizeError(error);

  return (
    <div className={["error-notice", className].filter(Boolean).join(" ")} role={role}>
      <p className="error-notice__message">{localized.message}</p>
      {localized.hint && <p className="error-notice__hint">{localized.hint}</p>}
      <details className="error-notice__detail">
        <summary>{t("detailLabel")}</summary>
        <code>{localized.detail}</code>
      </details>
    </div>
  );
}
