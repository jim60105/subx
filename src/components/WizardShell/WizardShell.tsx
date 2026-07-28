import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import "./WizardShell.css";

export interface WizardStep {
  id: string;
  /** Already-localized label supplied by the consuming feature. */
  label: string;
}

export type WizardStepState = "completed" | "active" | "upcoming";

export interface WizardNavAction {
  label: string;
  disabled?: boolean;
  /** Omitted only by a disabled placeholder, such as an in-progress label. */
  onClick?: () => void;
}

interface WizardShellProps {
  steps: WizardStep[];
  /** Zero-based index of the active step. */
  activeStep: number;
  children: ReactNode;
  /** Inline-start slot: retreat only. */
  back?: WizardNavAction;
  /** Inline-end cluster, before `next`: cancel, escape hatches — never forward motion. */
  secondary?: WizardNavAction;
  /** Inline-end-most slot: the primary, forward action. */
  next?: WizardNavAction;
}

export function stepState(index: number, activeStep: number): WizardStepState {
  if (index < activeStep) return "completed";
  if (index === activeStep) return "active";
  return "upcoming";
}

/**
 * Layout shared by every multi-step feature: a step indicator, a content slot,
 * and an action bar whose labels and enabled state the feature owns.
 *
 * The bar has three fixed positions — `back` at the inline start, then
 * `secondary` and `next` clustered at the inline end with `next` last — and is
 * rendered on every step, including steps that declare no action at all. That
 * is what keeps the primary control in one place: it sits outside the
 * scrollable content panel, so neither switching steps nor scrolling the body
 * moves it. Features route every forward action through `next` rather than
 * drawing buttons inside the panel.
 */
export function WizardShell({
  steps,
  activeStep,
  children,
  back,
  secondary,
  next,
}: WizardShellProps) {
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
        <div className="wizard__actions-end">
          {secondary && (
            <button
              type="button"
              className="wizard__button"
              disabled={secondary.disabled}
              onClick={secondary.onClick}
            >
              {secondary.label}
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
      </div>
    </section>
  );
}
