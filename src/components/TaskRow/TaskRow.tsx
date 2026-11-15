import { useId } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "./TaskRow.css";

interface TaskRowProps {
  /** One-based position in the task list, shown as a two-digit serif numeral. */
  ordinal: number;
  name: string;
  /** Read to assistive technology in place of the specimen. */
  description: string;
  /** Visual demonstration of the task; hidden from the accessibility tree. */
  specimen: ReactNode;
  /** Unimplemented features render as a non-interactive "coming soon" row. */
  disabled?: boolean;
  onSelect?: () => void;
}

/**
 * One home-list entry: the whole row is the button. The description sits
 * outside it, linked by `aria-describedby`, so the button's accessible name
 * stays the task name alone.
 */
export function TaskRow({ ordinal, name, description, specimen, disabled = false, onSelect }: TaskRowProps) {
  const { t } = useTranslation("common");
  const descriptionId = useId();

  return (
    <>
      <button
        type="button"
        className="task-row"
        disabled={disabled}
        aria-disabled={disabled}
        aria-describedby={descriptionId}
        onClick={disabled ? undefined : onSelect}
      >
        <span className="task-row__ordinal serif" aria-hidden="true">
          {String(ordinal).padStart(2, "0")}
        </span>
        <span className="task-row__title serif">{name}</span>
        <span className="task-row__specimen" aria-hidden="true">
          {specimen}
        </span>
        {disabled ? (
          <span className="task-row__badge">{t("status.comingSoon")}</span>
        ) : (
          <span className="task-row__go" aria-hidden="true">
            →
          </span>
        )}
      </button>
      <span id={descriptionId} className="visually-hidden">
        {description}
      </span>
    </>
  );
}
