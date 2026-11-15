import { act, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { setPrefersReducedMotion } from "../../test/matchMedia";
import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import type { MatchStage, SourceScanResult } from "../../types/ipc";
import {
  LOOM_CYCLE_MS,
  PAIRS,
  SUBTITLE_BARS,
  TRIALS_PER_PAIR,
  VIDEO_BARS,
} from "./AnalysisIllustration";
import { AnalysisStep } from "./AnalysisStep";

const STAGES: readonly MatchStage[] = ["scanning", "analyzing", "finalizing"];

function renderStep(stage: MatchStage | null, scan: SourceScanResult | null = { videoCount: 24, subtitleCount: 31 }) {
  return renderWithI18n(<AnalysisStep stage={stage} error={undefined} scan={scan} />);
}

function loom(container: HTMLElement): SVGSVGElement {
  const svg = container.querySelector<SVGSVGElement>("svg.analysis-loom");
  if (svg === null) throw new Error("the analysis step rendered no illustration");
  return svg;
}

beforeEach(async () => {
  await setupI18n("en");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("the analysis step", () => {
  it.each(STAGES)("exposes no progress semantics while %s", (stage) => {
    const { container } = renderStep(stage);

    expect(loom(container)).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(container.textContent).not.toContain("%");
  });

  it("draws the same number of shapes whatever the scan found", () => {
    const small = renderStep("analyzing", { videoCount: 3, subtitleCount: 5 });
    const smallVideos = small.container.querySelectorAll(".analysis-loom__video").length;
    const smallSubtitles = small.container.querySelectorAll(".analysis-loom__subtitle").length;
    small.unmount();

    const large = renderStep("analyzing", { videoCount: 300, subtitleCount: 500 });
    const largeVideos = large.container.querySelectorAll(".analysis-loom__video").length;
    const largeSubtitles = large.container.querySelectorAll(".analysis-loom__subtitle").length;

    expect(largeVideos).toBe(smallVideos);
    expect(largeSubtitles).toBe(smallSubtitles);
    expect(smallVideos).toBe(VIDEO_BARS);
    expect(smallSubtitles).toBe(SUBTITLE_BARS);
  });

  it("shows the two scan totals with their nouns and no text in the illustration", () => {
    const { container } = renderStep("analyzing", { videoCount: 24, subtitleCount: 1 });

    const totals = container.querySelector(".analysis-step__totals");
    expect(totals).toHaveTextContent("24 videos");
    expect(totals).toHaveTextContent("1 subtitle");
    expect(loom(container).textContent).toBe("");
    expect(loom(container).querySelector("text, title")).toBeNull();
  });

  it("omits the totals when there is no scan", () => {
    const { container } = renderStep("scanning", null);
    expect(container.querySelector(".analysis-step__totals")).toBeNull();
  });

  it("renders a static illustration under reduced motion while the stage word still moves", () => {
    setPrefersReducedMotion(true);
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const { container, rerender } = renderStep("scanning");
    const drawings: string[] = [];

    for (const stage of STAGES) {
      rerender(<AnalysisStep stage={stage} error={undefined} scan={{ videoCount: 24, subtitleCount: 31 }} />);
      drawings.push(loom(container).outerHTML);
      const current = container.querySelector('[aria-current="step"]');
      expect(current).toHaveTextContent(
        { scanning: "Scan", analyzing: "Analyze", finalizing: "Arrange" }[stage],
      );
    }

    expect(new Set(drawings).size).toBe(1);
    expect(loom(container)).toHaveAttribute("data-motion", "static");
    expect(container.querySelector(".analysis-loom__curves")).toBeNull();
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it("replays the pairing sequence once per cycle while analyzing", () => {
    vi.useFakeTimers();
    const { container } = renderStep("analyzing");
    const cycle = () => container.querySelector(".analysis-loom__curves")?.getAttribute("data-cycle");

    expect(cycle()).toBe("0");
    expect(container.querySelectorAll(".analysis-loom__trial")).toHaveLength(PAIRS.length * TRIALS_PER_PAIR);
    act(() => {
      vi.advanceTimersByTime(LOOM_CYCLE_MS);
    });
    expect(cycle()).toBe("1");
  });

  it("clears its interval on unmount", () => {
    const setIntervalSpy = vi.spyOn(window, "setInterval");
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const { unmount } = renderStep("analyzing");

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    const id = setIntervalSpy.mock.results[0].value;
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalledWith(id);
  });

  it("stops replaying once the stage leaves analyzing", () => {
    const clearIntervalSpy = vi.spyOn(window, "clearInterval");
    const { container, rerender } = renderStep("analyzing");

    rerender(<AnalysisStep stage="finalizing" error={undefined} scan={null} />);

    expect(clearIntervalSpy).toHaveBeenCalled();
    expect(container.querySelectorAll(".analysis-loom__trial")).toHaveLength(0);
    expect(container.querySelectorAll('.analysis-loom__settled[data-final="true"]')).toHaveLength(PAIRS.length);
    const paired = new Set(PAIRS.map(([, subtitle]) => subtitle));
    container.querySelectorAll(".analysis-loom__subtitle").forEach((bar, index) => {
      expect(bar.getAttribute("data-orphan")).toBe(paired.has(index) ? null : "true");
    });
  });

  it("draws bars only while scanning", () => {
    const { container } = renderStep(null);
    expect(loom(container)).toHaveAttribute("data-stage", "scanning");
    expect(container.querySelector(".analysis-loom__curves")).toBeNull();
  });

  it("finishes the pairing sequence well inside one cycle", () => {
    // The last settled curve starts at tick (pairs × ticks-per-pair − 1) and
    // runs for --motion-base (200 ms); a cycle that cut it short would jump.
    const lastTick = PAIRS.length * (TRIALS_PER_PAIR + 1) - 1;
    expect(lastTick * 190 + 420).toBeLessThan(LOOM_CYCLE_MS);
  });

  it("shows the failure instead of the illustration", () => {
    const { container } = renderWithI18n(
      <AnalysisStep stage="analyzing" error={{ code: "match.ai_unavailable", message: "x", hintCode: null }} scan={null} />,
    );
    expect(container.querySelector("svg.analysis-loom")).toBeNull();
    expect(container.querySelector(".analysis-step__stages")).toBeNull();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
