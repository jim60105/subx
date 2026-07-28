import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { SyncDetectStep } from "./SyncDetectStep";

const DEFAULTS = { defaultMethod: "auto", vadSensitivity: 40, maxOffsetMs: 60_000 } as const;

function renderStep(isDetecting: boolean) {
  return renderWithI18n(
    <SyncDetectStep
      method="auto"
      defaults={DEFAULTS}
      isDetecting={isDetecting}
      detection={null}
      detectError={undefined}
      offsetMs={0}
      offsetExceedsMax={false}
      onOffsetChange={() => {}}
    />,
  );
}

beforeEach(async () => {
  await setupI18n("en");
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  vi.useRealTimers();
});

/**
 * VAD decodes the whole audio track with nothing to report in between — the
 * crate exposes no progress hook — so elapsed time is the only honest signal
 * that the app is still working. A stalled counter would read as a hang.
 */
describe("the detection spinner's elapsed time", () => {
  it("counts up while the detection runs", async () => {
    renderStep(true);

    expect(screen.getByRole("status")).toHaveTextContent("Analysing the audio… 0s");

    await act(async () => {
      vi.advanceTimersByTime(2_000);
    });

    expect(screen.getByRole("status")).toHaveTextContent("Analysing the audio… 2s");
  });

  it("leaves no timer behind when the step goes away", () => {
    const { unmount } = renderStep(true);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();

    expect(vi.getTimerCount()).toBe(0);
  });

  /// A step that is not detecting must not be ticking either — the interval is
  /// created only while the run is live.
  it("runs no timer when there is no detection", () => {
    renderStep(false);

    expect(vi.getTimerCount()).toBe(0);
  });
});
