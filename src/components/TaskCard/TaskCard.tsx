import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "./TaskCard.css";

interface TaskCardProps {
  name: string;
  description: string;
  icon: ReactNode;
  /** Unimplemented features render as a non-interactive "coming soon" card. */
  disabled?: boolean;
  onSelect?: () => void;
}

export function TaskCard({ name, description, icon, disabled = false, onSelect }: TaskCardProps) {
  const { t } = useTranslation("common");

  return (
    <button
      type="button"
      className="task-card"
      disabled={disabled}
      aria-disabled={disabled}
      onClick={disabled ? undefined : onSelect}
    >
      <span className="task-card__icon" aria-hidden="true">
        {icon}
      </span>
      <span className="task-card__body">
        <span className="task-card__title">{name}</span>
        <span className="task-card__description">{description}</span>
      </span>
      {disabled && <span className="task-card__badge">{t("status.comingSoon")}</span>}
    </button>
  );
}
