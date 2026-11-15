import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { formatSeconds, NUDGE_STEP_MS, OffsetField } from "./OffsetField";
import { PREVIEW_CUES, PREVIEW_MAX_SHIFT, PREVIEW_MS_PER_PERCENT, previewShift } from "./OffsetPreview";

function StatefulOffsetField({ initial = 0 }: { initial?: number }) {
  const [offsetMs, setOffsetMs] = useState(initial);
  return (
    <OffsetField offsetMs={offsetMs} maxOffsetMs={60_000} exceedsMax={false} onChange={setOffsetMs} />
  );
}

function renderField(offsetMs: number) {
  return renderWithI18n(
    <OffsetField offsetMs={offsetMs} maxOffsetMs={60_000} exceedsMax={false} onChange={() => {}} />,
  );
}

const field = () => screen.getByRole("spinbutton", { name: "Offset in milliseconds" });
const figure = (container: HTMLElement) => container.querySelector(".offset-field__figure");
const preview = (container: HTMLElement) => container.querySelector(".offset-preview") as HTMLElement;
const cues = (container: HTMLElement, row: "original" | "shifted") =>
  Array.from(container.querySelectorAll<HTMLElement>(`[data-row="${row}"]`));

describe("the offset field", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  // @covers sync-workflow/offset-is-shown-as-a-nudgeable-figure-with-a-schematic-preview#nudge-controls-step-the-offset
  it("steps the offset with the nudge controls and keeps the figure and field in agreement", async () => {
    const user = userEvent.setup();
    const { container } = renderWithI18n(<StatefulOffsetField />);
    const increase = screen.getByRole("button", { name: `Increase by ${NUDGE_STEP_MS} ms` });
    const decrease = screen.getByRole("button", { name: `Decrease by ${NUDGE_STEP_MS} ms` });

    await user.click(increase);
    expect(field()).toHaveValue(NUDGE_STEP_MS);
    expect(figure(container)).toHaveTextContent(formatSeconds(NUDGE_STEP_MS));
    expect(figure(container)).toHaveTextContent("+0.05");

    await user.click(decrease);
    expect(field()).toHaveValue(0);
    expect(figure(container)).toHaveTextContent("0.00");

    await user.click(decrease);
    expect(field()).toHaveValue(-NUDGE_STEP_MS);
    expect(figure(container)).toHaveTextContent("−0.05");
  });

  it("follows a value typed into the millisecond field", async () => {
    const user = userEvent.setup();
    const { container } = renderWithI18n(<StatefulOffsetField />);

    await user.clear(field());
    await user.type(field(), "1250");

    expect(figure(container)).toHaveTextContent("+1.25");
  });

  // @covers sync-workflow/offset-is-shown-as-a-nudgeable-figure-with-a-schematic-preview#preview-follows-the-sign-of-the-offset
  it("marks the direction of the offset while the original row stays put", () => {
    const directions: string[] = [];
    const originalStyles: string[][] = [];
    for (const offsetMs of [250, 0, -250]) {
      const { container, unmount } = renderField(offsetMs);
      directions.push(preview(container).dataset.direction ?? "");
      originalStyles.push(cues(container, "original").map((cue) => cue.getAttribute("style") ?? ""));
      unmount();
    }

    expect(directions).toEqual(["later", "none", "earlier"]);
    expect(originalStyles[1]).toEqual(originalStyles[0]);
    expect(originalStyles[2]).toEqual(originalStyles[0]);
  });

  it("moves the shifted row with the sign of the offset", () => {
    const { container, rerender } = renderField(250);
    const [first] = PREVIEW_CUES;
    expect(cues(container, "shifted")[0].style.left).toBe(`${first[0] + 2.5}%`);

    rerender(
      <OffsetField offsetMs={-250} maxOffsetMs={60_000} exceedsMax={false} onChange={() => {}} />,
    );
    expect(cues(container, "shifted")[0].style.left).toBe(`${first[0] - 2.5}%`);
  });

  // @covers sync-workflow/offset-is-shown-as-a-nudgeable-figure-with-a-schematic-preview#preview-is-schematic-and-hidden-from-assistive-technology
  it("keeps the preview schematic and out of the accessibility tree", () => {
    for (const offsetMs of [0, 250]) {
      const { container, unmount } = renderField(offsetMs);

      expect(preview(container)).toHaveAttribute("aria-hidden", "true");
      expect(cues(container, "original")).toHaveLength(PREVIEW_CUES.length);
      expect(cues(container, "shifted")).toHaveLength(PREVIEW_CUES.length);

      const hint = screen.getByText(
        "A positive value delays the subtitles; a negative one makes them appear sooner.",
      );
      expect(hint).toHaveClass("visually-hidden");
      expect(field()).toHaveAccessibleDescription(hint.textContent ?? "");
      unmount();
    }
  });
});

describe("previewShift", () => {
  it.each([
    [0, 0],
    [PREVIEW_MS_PER_PERCENT, 1],
    [-PREVIEW_MS_PER_PERCENT * 3, -3],
    [PREVIEW_MS_PER_PERCENT * PREVIEW_MAX_SHIFT, PREVIEW_MAX_SHIFT],
    [60_000, PREVIEW_MAX_SHIFT],
    [-60_000, -PREVIEW_MAX_SHIFT],
  ])("maps %i ms to a %d %% shift", (offsetMs, expected) => {
    expect(previewShift(offsetMs)).toBe(expected);
  });
});

describe("formatSeconds", () => {
  it("signs the figure and leaves zero unsigned", () => {
    expect(formatSeconds(750)).toBe("+0.75");
    expect(formatSeconds(-1500)).toBe("−1.50");
    expect(formatSeconds(0)).toBe("0.00");
    expect(formatSeconds(4)).toBe("0.00");
    expect(formatSeconds(-4)).toBe("0.00");
    expect(formatSeconds(-5)).toBe("\u22120.01");
  });
});
