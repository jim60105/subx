import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { SYNC_DEFAULTS } from "../../test/screenFixtures";
import { SyncDetectStep } from "./SyncDetectStep";
import type { DetectPhase } from "./useSyncWizard";

const HINT = "Lower is stricter: quieter passages are less likely to count as speech.";

function renderStep(phase: DetectPhase, hasMedia = true) {
  return renderWithI18n(
    <SyncDetectStep
      phase={phase}
      hasMedia={hasMedia}
      defaults={SYNC_DEFAULTS}
      defaultsError={undefined}
      sensitivity={50}
      detectError={
        phase === "failed"
          ? { code: "sync.vad_unavailable", message: "no VAD", hintCode: null }
          : undefined
      }
      onSensitivityChange={() => {}}
    />,
  );
}

beforeEach(async () => {
  await setupI18n("en");
});

describe("the detect step", () => {
  // @covers sync-workflow/sensitivity-slider-labels-both-ends#both-ends-are-labelled
  it("labels both ends of the sensitivity slider and keeps the sentence as its description", () => {
    renderStep("ask");

    expect(screen.getByText("Stricter")).toBeVisible();
    expect(screen.getByText("More sensitive")).toBeVisible();

    const slider = screen.getByRole("slider", { name: /Speech sensitivity/ });
    expect(slider).toHaveAccessibleDescription(HINT);
    expect(slider).not.toHaveAccessibleName(/Stricter|More sensitive/);
    expect(screen.getByText(HINT)).toHaveClass("visually-hidden");
  });

  it("shows elapsed seconds as the only progress, beside an illustration hidden from assistive technology", () => {
    const { container } = renderStep("detecting");

    expect(screen.getByRole("status")).toHaveTextContent("0 s");
    expect(screen.queryByRole("progressbar")).not.toBeInTheDocument();
    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    const instrument = container.querySelector(".sync-detect__instrument");
    expect(instrument).toHaveAttribute("aria-hidden", "true");
    expect(instrument).toHaveAttribute("data-listening", "true");
  });

  it("keeps the illustration still outside detection", () => {
    const { container } = renderStep("ask");

    expect(container.querySelector(".sync-detect__instrument")).toHaveAttribute(
      "data-listening",
      "false",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the error and the slider when detection failed", () => {
    renderStep("failed");

    expect(screen.getByText("No offset was detected")).toBeInTheDocument();
    expect(
      screen.getByText("Automatic detection is unavailable on this system."),
    ).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: /Speech sensitivity/ })).toBeInTheDocument();
  });

  it("explains, instead of offering a slider, why there is nothing to detect without media", () => {
    renderStep("ask", false);

    expect(screen.queryByRole("slider")).not.toBeInTheDocument();
    expect(
      screen.getByText(/Add a video or audio file in the first step to enable detection/),
    ).toBeInTheDocument();
  });
});

/**
 * VAD decodes the whole audio track with nothing to report in between — the
 * crate exposes no progress hook — so elapsed time is the only honest signal
 * that the app is still working. A stalled counter would read as a hang.
 */
describe("the detection's elapsed time", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("counts up while the detection runs", async () => {
    renderStep("detecting");

    expect(screen.getByRole("status")).toHaveTextContent("0 s");

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByRole("status")).toHaveTextContent("2 s");
  });

  it("leaves no timer behind when the step goes away", () => {
    const { unmount } = renderStep("detecting");
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  /// A step that is not detecting must not be ticking either — the interval is
  /// created only while the run is live.
  it("runs no timer when there is no detection", () => {
    renderStep("ask");

    expect(vi.getTimerCount()).toBe(0);
  });
});
