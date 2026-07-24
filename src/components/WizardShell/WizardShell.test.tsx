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
    const onNext = vi.fn();
    renderWithI18n(
      <WizardShell
        steps={STEPS}
        activeStep={1}
        back={{ label: "Back", onClick: onBack }}
        next={{ label: "Continue", onClick: onNext }}
      >
        <p>content</p>
      </WizardShell>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Back" }));
    await userEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(onBack).toHaveBeenCalledOnce();
    expect(onNext).toHaveBeenCalledOnce();
  });
});
