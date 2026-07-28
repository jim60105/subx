import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { WizardShell, stepState } from "./WizardShell";
import type { WizardStep } from "./WizardShell";

const STEPS: WizardStep[] = [
  { id: "sources", label: "Sources" },
  { id: "analysis", label: "Analysis" },
  { id: "review", label: "Review" },
  { id: "execute", label: "Execute" },
];

describe("stepState", () => {
  it("classifies steps relative to the active one", () => {
    expect(stepState(0, 2)).toBe("completed");
    expect(stepState(2, 2)).toBe("active");
    expect(stepState(3, 2)).toBe("upcoming");
  });
});

describe("WizardShell", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  // @covers app-shell/reusable-wizardshell-layout#step-indicator-reflects-progress
  it("renders every step with the right state and counter", () => {
    renderWithI18n(
      <WizardShell steps={STEPS} activeStep={2}>
        <p>content</p>
      </WizardShell>,
    );

    const items = screen.getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(items[0]).toHaveAttribute("data-state", "completed");
    expect(items[2]).toHaveAttribute("data-state", "active");
    expect(items[2]).toHaveAttribute("aria-current", "step");
    expect(items[3]).toHaveAttribute("data-state", "upcoming");
    expect(screen.getByText("Step 3 of 4")).toBeInTheDocument();
  });

  it("renders the content slot", () => {
    renderWithI18n(
      <WizardShell steps={STEPS} activeStep={0}>
        <p>step body</p>
      </WizardShell>,
    );

    expect(screen.getByText("step body")).toBeInTheDocument();
  });

  // @covers app-shell/reusable-wizardshell-layout#navigation-controls-are-feature-controlled
  it("lets the feature disable the next action", async () => {
    const onNext = vi.fn();
    renderWithI18n(
      <WizardShell
        steps={STEPS}
        activeStep={0}
        next={{ label: "Continue", disabled: true, onClick: onNext }}
      >
        <p>content</p>
      </WizardShell>,
    );

    const next = screen.getByRole("button", { name: "Continue" });
    expect(next).toBeDisabled();

    await userEvent.click(next);

    expect(onNext).not.toHaveBeenCalled();
  });

  it("invokes the feature-supplied navigation handlers", async () => {
    const onBack = vi.fn();
    const onSecondary = vi.fn();
    const onNext = vi.fn();
    renderWithI18n(
      <WizardShell
        steps={STEPS}
        activeStep={1}
        back={{ label: "Back", onClick: onBack }}
        secondary={{ label: "Cancel", onClick: onSecondary }}
        next={{ label: "Continue", onClick: onNext }}
      >
        <p>content</p>
      </WizardShell>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onSecondary).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });

  // @covers app-shell/reusable-wizardshell-layout#action-bar-persists-across-steps
  it("renders the action bar even for a step that declares no action", () => {
    const { container } = renderWithI18n(
      <WizardShell steps={STEPS} activeStep={0}>
        <p>content</p>
      </WizardShell>,
    );

    // Present and empty, so its reserved height is the same as a step that
    // fills it — nothing below the panel shifts on the way through a wizard.
    const bar = container.querySelector(".wizard__actions");
    expect(bar).toBeInTheDocument();
    expect(bar?.querySelectorAll("button")).toHaveLength(0);
  });

  // @covers app-shell/reusable-wizardshell-layout#a-lone-back-action-stays-at-the-inline-start
  it("keeps a lone back action out of the primary position", () => {
    const { container } = renderWithI18n(
      <WizardShell steps={STEPS} activeStep={1} back={{ label: "Back", onClick: vi.fn() }}>
        <p>content</p>
      </WizardShell>,
    );

    // Back is a direct child of the bar, not of the inline-end cluster where
    // the primary control lives; the cluster is empty.
    const bar = container.querySelector(".wizard__actions");
    const end = container.querySelector(".wizard__actions-end");
    expect(screen.getByRole("button", { name: "Back" }).parentElement).toBe(bar);
    expect(end?.querySelectorAll("button")).toHaveLength(0);
  });

  it("orders the inline-end cluster secondary-then-primary", () => {
    const { container } = renderWithI18n(
      <WizardShell
        steps={STEPS}
        activeStep={1}
        back={{ label: "Back", onClick: vi.fn() }}
        secondary={{ label: "Cancel", onClick: vi.fn() }}
        next={{ label: "Continue", onClick: vi.fn() }}
      >
        <p>content</p>
      </WizardShell>,
    );

    const end = container.querySelector(".wizard__actions-end");
    const labels = [...(end?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
    expect(labels).toEqual(["Cancel", "Continue"]);
    // The primary is the bar's last control, which is what "bottom right" means.
    expect(end?.lastElementChild).toHaveClass("wizard__button--primary");
  });

  /**
   * jsdom applies no stylesheets and cannot scroll, so the guarantee is
   * asserted structurally: the bar is a sibling of the scroll container rather
   * than living inside it, which is what makes its position independent of how
   * far the step body has been scrolled.
   */
  // @covers app-shell/reusable-wizardshell-layout#scrolling-the-step-body-does-not-move-the-primary-action
  it("keeps the action bar outside the scrolling content panel", () => {
    const { container } = renderWithI18n(
      <WizardShell steps={STEPS} activeStep={0} next={{ label: "Continue", onClick: vi.fn() }}>
        <p>content</p>
      </WizardShell>,
    );

    const content = container.querySelector(".wizard__content");
    const bar = container.querySelector(".wizard__actions");
    expect(content?.contains(bar ?? null)).toBe(false);
    expect(bar?.parentElement).toBe(content?.parentElement);
  });

  it("renders a disabled placeholder that carries no handler", async () => {
    renderWithI18n(
      <WizardShell steps={STEPS} activeStep={1} next={{ label: "Converting…", disabled: true }}>
        <p>content</p>
      </WizardShell>,
    );

    const next = screen.getByRole("button", { name: "Converting…" });
    expect(next).toBeDisabled();
    await userEvent.click(next);
  });
});
