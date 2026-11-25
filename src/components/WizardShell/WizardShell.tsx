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
  /**
   * Accessible name, when the visible label rounds a figure. It must start
   * with the visible text (WCAG 2.5.3, label in name).
   */
  accessibleLabel?: string;
  /**
   * Short status rendered directly before the control, such as how many items
   * the primary action will act on. Honoured on `next` only.
   */
  note?: {
    /** Visible figure, e.g. "12 / 14". */
    text: string;
    /** Accessible wording that states the figure in words. */
    label: string;
  };
}

interface WizardShellProps {
  steps: WizardStep[];
  /** Zero-based index of the active step. */
  activeStep: number;
  children: ReactNode;
  /** Inline-start slot: retreat only. */
  back?: WizardNavAction;
  /** Inline-end cluster, before `next`: cancel, escape hatches, or the
   * non-primary forward choices. At most two. */
  secondary?: WizardNavAction | readonly [WizardNavAction, WizardNavAction];
  /** Inline-end-most slot: the primary, forward action. */
  next?: WizardNavAction;
}

/** The secondary slot as a list, in declared order. */
function secondaryList(
  secondary: WizardShellProps["secondary"],
): readonly WizardNavAction[] {
  if (secondary === undefined) return [];
  return "label" in secondary ? [secondary] : secondary;
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
 * moves it. Features route every forward action through `next` — or, for a
 * step offering several forward choices, the non-primary ones through
 * `secondary` — rather than drawing buttons inside the panel.
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
              {/* The ordinal stays in every state; completion is carried by
                  colour and by the visually hidden state text. */}
              <span className="wizard__step-marker serif" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="wizard__step-label">{step.label}</span>
              <span className="visually-hidden">{t(`stepState.${state}`)}</span>
            </li>
          );
        })}
      </ol>

      {/* Announced for assistive technology; the stepper already shows it. */}
      <p className="wizard__counter visually-hidden">
        {t("stepCounter", { current: activeStep + 1, total: steps.length })}
      </p>

      <div className="wizard__content">{children}</div>

      <div className="wizard__actions">
        {back && (
          <button
            type="button"
            className="button button--tertiary wizard__button"
            disabled={back.disabled}
            aria-label={back.accessibleLabel}
            onClick={back.onClick}
          >
            {back.label}
          </button>
        )}
        <div className="wizard__actions-end">
          {secondaryList(secondary).map((action, index) => (
            // Keyed by position: the slot's order is what stays stable.
            <button
              key={index}
              type="button"
              className="button button--tertiary wizard__button"
              disabled={action.disabled}
              aria-label={action.accessibleLabel}
              onClick={action.onClick}
            >
              {action.label}
            </button>
          ))}
          {/* A polite status, not a control: it sits beside the primary
              action without taking a slot or a tab stop of its own. */}
          {next?.note && (
            <span className="wizard__note" role="status">
              <span className="wizard__note-text serif" aria-hidden="true">
                {next.note.text}
              </span>
              <span className="visually-hidden">{next.note.label}</span>
            </span>
          )}
          {next && (
            <button
              type="button"
              className="button button--primary wizard__button wizard__button--primary"
              disabled={next.disabled}
              aria-label={next.accessibleLabel}
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
