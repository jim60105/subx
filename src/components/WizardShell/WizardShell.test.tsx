import { screen, within } from "@testing-library/react";
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

  // @covers app-shell/step-indicator-shows-two-digit-ordinals-and-hides-the-step-counter#ordinals-stay-visible-in-every-state
  it("shows a two-digit ordinal for a completed, the active, and an upcoming step", () => {
    const { container } = renderWithI18n(
      <WizardShell steps={STEPS.slice(0, 3)} activeStep={1}>
        <p>content</p>
      </WizardShell>,
    );

    const markers = [...container.querySelectorAll(".wizard__step-marker")].map((marker) => marker.textContent);
    expect(markers).toEqual(["01", "02", "03"]);
    expect(screen.getAllByRole("listitem").map((item) => item.getAttribute("data-state"))).toEqual([
      "completed",
      "active",
      "upcoming",
    ]);
  });

  // @covers app-shell/step-indicator-shows-two-digit-ordinals-and-hides-the-step-counter#step-counter-is-announced-but-not-shown
  it("keeps the step counter in the document but visually hidden", () => {
    renderWithI18n(
      <WizardShell steps={STEPS} activeStep={1}>
        <p>content</p>
      </WizardShell>,
    );

    expect(screen.getByText("Step 2 of 4")).toHaveClass("visually-hidden");
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

  // @covers app-shell/reusable-wizardshell-layout#secondary-holds-two-controls
  it("renders two secondary actions in declared order before the primary", async () => {
    const user = userEvent.setup();
    const skip = vi.fn();
    const start = vi.fn();
    const { container } = renderWithI18n(
      <WizardShell
        steps={STEPS}
        activeStep={1}
        back={{ label: "Back", onClick: vi.fn() }}
        secondary={[
          { label: "Skip", onClick: skip },
          { label: "Start", onClick: start },
        ]}
        next={{ label: "Keep", onClick: vi.fn() }}
      >
        <p>content</p>
      </WizardShell>,
    );

    const end = container.querySelector(".wizard__actions-end");
    const labels = [...(end?.querySelectorAll("button") ?? [])].map((b) => b.textContent);
    expect(labels).toEqual(["Skip", "Start", "Keep"]);
    expect(end?.lastElementChild).toHaveClass("wizard__button--primary");

    await user.click(screen.getByRole("button", { name: "Start" }));
    expect(start).toHaveBeenCalledOnce();
    expect(skip).not.toHaveBeenCalled();
  });

  /// A label that rounds a figure gets an accessible name that states it
  /// exactly, still starting with the visible text (WCAG 2.5.3).
  it("uses an action's accessible label as its accessible name", () => {
    renderWithI18n(
      <WizardShell
        steps={STEPS}
        activeStep={1}
        secondary={{ label: "Keep +1.25 s", accessibleLabel: "Keep +1.25 s (1.254 seconds)" }}
        next={{ label: "Go", accessibleLabel: "Go now" }}
      >
        <p>content</p>
      </WizardShell>,
    );

    expect(screen.getByRole("button", { name: "Keep +1.25 s (1.254 seconds)" })).toHaveTextContent(
      "Keep +1.25 s",
    );
    expect(screen.getByRole("button", { name: "Go now" })).toBeInTheDocument();
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

  // @covers app-shell/primary-action-can-carry-a-status-note#a-note-renders-beside-the-primary-action
  it("renders a note beside the primary action as a non-focusable status", () => {
    const { container } = renderWithI18n(
      <WizardShell
        steps={STEPS}
        activeStep={2}
        back={{ label: "Back", onClick: vi.fn() }}
        next={{ label: "Continue", onClick: vi.fn(), note: { text: "12 / 14", label: "12 of 14 selected" } }}
      >
        <p>content</p>
      </WizardShell>,
    );

    const end = container.querySelector(".wizard__actions-end");
    const note = screen.getByRole("status");
    expect(end?.contains(note)).toBe(true);
    expect(note.nextElementSibling).toBe(screen.getByRole("button", { name: "Continue" }));
    expect(note.querySelector("button")).toBeNull();
    expect(note).not.toHaveAttribute("tabindex");
    expect(note).toHaveTextContent("12 of 14 selected");
    expect(screen.getByText("12 / 14")).toHaveAttribute("aria-hidden", "true");
  });

  // @covers app-shell/primary-action-can-carry-a-status-note#no-note-leaves-the-action-bar-unchanged
  it("renders no status in the action bar when the primary action has no note", () => {
    const { container } = renderWithI18n(
      <WizardShell
        steps={STEPS}
        activeStep={2}
        back={{ label: "Back", onClick: vi.fn(), note: { text: "1", label: "ignored" } }}
        next={{ label: "Continue", onClick: vi.fn() }}
      >
        <p>content</p>
      </WizardShell>,
    );

    const bar = container.querySelector(".wizard__actions") as HTMLElement;
    expect(within(bar).queryByRole("status")).toBeNull();
    expect(container.querySelector(".wizard__actions-end")?.children).toHaveLength(1);
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
