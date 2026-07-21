import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "./WizardShell.css";

export interface WizardStep {
  id: string;
  /** Already-localized label supplied by the consuming feature. */
  label: string;
}

export type WizardStepState = "completed" | "active" | "upcoming";

interface WizardNavAction {
  label: string;
  disabled?: boolean;
  onClick: () => void;
}

interface WizardShellProps {
  steps: WizardStep[];
  /** Zero-based index of the active step. */
  activeStep: number;
  children: ReactNode;
  back?: WizardNavAction;
  next?: WizardNavAction;
}

export function stepState(index: number, activeStep: number): WizardStepState {
  if (index < activeStep) return "completed";
  if (index === activeStep) return "active";
  return "upcoming";
}

/**
 * Layout shared by every multi-step feature: a step indicator, a content slot,
 * and navigation controls whose labels and enabled state the feature owns.
 */
export function WizardShell({ steps, activeStep, children, back, next }: WizardShellProps) {
  const { t } = useTranslation("wizard");

  return (
    <section className="wizard">
      <ol className="wizard__steps" aria-label={t("progressLabel")}>
        {steps.map((step, index) => {
          const state = stepState(index, activeStep);
          return (
            <li
              key={step.id}
              className="wizard__step"
              data-state={state}
              aria-current={state === "active" ? "step" : undefined}
            >
              <span className="wizard__step-marker" aria-hidden="true">
                {state === "completed" ? "✓" : index + 1}
              </span>
              <span className="wizard__step-label">{step.label}</span>
              <span className="visually-hidden">{t(`stepState.${state}`)}</span>
            </li>
          );
        })}
      </ol>

      <p className="wizard__counter">
        {t("stepCounter", { current: activeStep + 1, total: steps.length })}
      </p>

      <div className="wizard__content">{children}</div>

      {(back || next) && (
        <div className="wizard__actions">
          {back && (
            <button
              type="button"
              className="wizard__button"
              disabled={back.disabled}
              onClick={back.onClick}
            >
              {back.label}
            </button>
          )}
          {next && (
            <button
              type="button"
              className="wizard__button wizard__button--primary"
              disabled={next.disabled}
              onClick={next.onClick}
            >
              {next.label}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
