import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { BatchProgressBar } from "./BatchProgressBar";

function segments(container: HTMLElement) {
  return [...container.querySelectorAll<HTMLElement>(".batch-bar__segment")];
}

const BASE = {
  totalCues: 378,
  batchSize: 40,
  batchTotal: 10,
  batchesDone: 5,
  batchInFlight: 6,
  resend: false,
  stage: "translating" as const,
};

describe("BatchProgressBar", () => {
  // @covers translate-workflow/segmented-bar-mirrors-real-batches#segment-count-and-widths-follow-the-batches
  it("draws one segment per batch, the last one as wide as its cues", () => {
    const { container } = render(<BatchProgressBar {...BASE} />);

    const widths = segments(container).map((segment) => segment.style.flexGrow);
    expect(widths).toHaveLength(10);
    expect(widths.slice(0, 9)).toEqual(Array(9).fill("40"));
    expect(widths[9]).toBe("18");
  });

  // @covers translate-workflow/segmented-bar-mirrors-real-batches#returned-and-in-flight-segments
  it("fills returned batches, marks the one in flight and leaves the rest empty", () => {
    const { container } = render(<BatchProgressBar {...BASE} />);

    expect(segments(container).map((segment) => segment.dataset.state)).toEqual([
      "done", "done", "done", "done", "done", "inflight", "empty", "empty", "empty", "empty",
    ]);
  });

  it("marks a resend distinctly", () => {
    const { container } = render(<BatchProgressBar {...BASE} resend />);

    expect(segments(container)[5].dataset.state).toBe("resend");
  });

  // @covers translate-workflow/segmented-bar-mirrors-real-batches#no-segment-is-in-flight-outside-the-translating-phase
  it.each(["terminology", "fillIn", "writing"] as const)("marks nothing in flight during %s", (stage) => {
    const { container } = render(<BatchProgressBar {...BASE} stage={stage} />);

    expect(segments(container).some((segment) => segment.dataset.state === "inflight")).toBe(false);
  });

  it("is hidden from assistive technology", () => {
    const { container } = render(<BatchProgressBar {...BASE} />);

    expect(container.querySelector(".batch-bar")).toHaveAttribute("aria-hidden", "true");
  });
});
