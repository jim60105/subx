import { screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import type { PreviewCueDto } from "../../types/ipc";
import { RULE_PX_PER_SECOND } from "./cueTiming";
import { SyncOffsetView } from "./SyncOffsetStep";
import { TimeRule } from "./TimeRule";
import type { PreviewSession } from "./usePreviewSession";

function cue(startMs: number, endMs: number): PreviewCueDto {
  return { startMs, endMs, text: `${startMs}` };
}

const px = (ms: number) => `${(ms / 1000) * RULE_PX_PER_SECOND}px`;

function renderRule(cues: readonly PreviewCueDto[], positionMs: number, offsetMs: number) {
  return renderWithI18n(<TimeRule cues={cues} positionMs={positionMs} offsetMs={offsetMs} />);
}

const rule = (container: HTMLElement) => container.querySelector<HTMLElement>(".time-rule");
const bars = (container: HTMLElement, row: "original" | "shifted") =>
  Array.from(container.querySelectorAll<HTMLElement>(`.time-rule__bar[data-row="${row}"]`));
const ticks = (container: HTMLElement) => container.querySelectorAll(".time-rule__tick");

/** 2000 one-second cues, one every two seconds. */
const LONG_SUBTITLE = Array.from({ length: 2_000 }, (_, i) => cue(i * 2_000, i * 2_000 + 1_000));

describe("the time rule", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("draws only the cues and the seconds in the window of a long subtitle", () => {
    // Without a measured width the window is 10 s either side: [1_990 s, 2_010 s].
    const { container } = renderRule(LONG_SUBTITLE, 2_000_000, 0);

    const lefts = bars(container, "original").map((bar) => bar.style.left);
    expect(lefts).toEqual(Array.from({ length: 11 }, (_, i) => px((995 + i) * 2_000)));
    expect(bars(container, "shifted")).toHaveLength(11);
    expect(ticks(container)).toHaveLength(21);
  });

  it("sizes the window from the rule's width", () => {
    // 780 px at 78 px per second: 5 s either side, [1_995 s, 2_005 s].
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(780);
    const { container } = renderRule(LONG_SUBTITLE, 2_000_000, 0);

    expect(bars(container, "original")).toHaveLength(6);
    expect(ticks(container)).toHaveLength(11);
  });

  it("draws no tick before the start of the media", () => {
    const { container } = renderRule([cue(1_000, 2_000)], 0, 0);

    expect(ticks(container)).toHaveLength(11);
    expect(ticks(container)[0]).toHaveStyle({ left: "0px" });
  });

  it("marks only the cue whose shifted interval holds the position", () => {
    const cues = [cue(1_000, 2_000), cue(3_000, 4_000), cue(5_000, 6_000)];
    // Shifted by +2 s, the first cue spans [3 s, 4 s); the second cue's
    // original interval holds the position but its shifted one does not.
    const { container } = renderRule(cues, 3_500, 2_000);

    const active = container.querySelectorAll('[data-active="true"]');
    expect(active).toHaveLength(1);
    expect(active[0]).toBe(bars(container, "shifted")[0]);
    expect(active[0]).toHaveStyle({ left: px(3_000) });
  });

  it("draws a cue clamped to zero length with its original bar only", () => {
    const { container } = renderRule([cue(200, 800), cue(2_000, 3_000)], 0, -1_000);

    expect(bars(container, "original").map((bar) => bar.style.left)).toEqual([px(200), px(2_000)]);
    expect(bars(container, "shifted").map((bar) => bar.style.left)).toEqual([px(1_000)]);
  });

  // @covers sync-workflow/offset-is-shown-as-a-nudgeable-figure-with-a-schematic-preview#preview-follows-the-sign-of-the-offset
  it("draws the shifted bar later than, at and earlier than the original with the sign of the offset", () => {
    const cues = [cue(5_000, 7_000)];
    const originals: string[] = [];
    const shiftedLefts: number[] = [];
    for (const offsetMs of [250, 0, -250]) {
      const { container, unmount } = renderRule(cues, 6_000, offsetMs);
      originals.push(bars(container, "original")[0].getAttribute("style") ?? "");
      shiftedLefts.push(parseFloat(bars(container, "shifted")[0].style.left));
      unmount();
    }

    const originalLeft = (5_000 / 1000) * RULE_PX_PER_SECOND;
    expect(shiftedLefts[0]).toBeGreaterThan(originalLeft);
    expect(shiftedLefts[1]).toBe(originalLeft);
    expect(shiftedLefts[2]).toBeLessThan(originalLeft);
    expect(originals[1]).toBe(originals[0]);
    expect(originals[2]).toBe(originals[0]);
  });

  // @covers sync-workflow/offset-is-shown-as-a-nudgeable-figure-with-a-schematic-preview#preview-is-schematic-and-hidden-from-assistive-technology
  it("stays out of the accessibility tree and is drawn from cue times only on the offset step", () => {
    const cues = [cue(1_000, 2_500), cue(4_000, 6_000)];
    const session: PreviewSession = {
      media: { status: "video", url: "http://127.0.0.1:9/s1" },
      cues,
      cueError: undefined,
      onMediaError: vi.fn(),
      requestAudio: vi.fn(),
      returnToVideo: vi.fn(),
    };

    for (const offsetMs of [0, 250]) {
      const { container, unmount } = renderWithI18n(
        <SyncOffsetView
          session={session}
          defaults={null}
          detection={null}
          offsetMs={offsetMs}
          offsetExceedsMax={false}
          onOffsetChange={() => {}}
        />,
      );

      const element = rule(container);
      expect(element).not.toBeNull();
      expect(element).toHaveAttribute("aria-hidden", "true");
      expect(element?.querySelectorAll("a, button, input, select, textarea, [tabindex]")).toHaveLength(0);
      expect(
        bars(container, "original").map((bar) => [bar.style.left, bar.style.width]),
      ).toEqual(cues.map((entry) => [px(entry.startMs), px(entry.endMs - entry.startMs)]));
      expect(
        bars(container, "shifted").map((bar) => [bar.style.left, bar.style.width]),
      ).toEqual(cues.map((entry) => [px(entry.startMs + offsetMs), px(entry.endMs - entry.startMs)]));

      const hint = screen.getByText(
        "A positive value delays the subtitles; a negative one makes them appear sooner.",
      );
      expect(hint).toHaveClass("visually-hidden");
      expect(screen.getByRole("spinbutton", { name: "Offset in milliseconds" })).toHaveAccessibleDescription(
        hint.textContent ?? "",
      );
      unmount();
    }
  });
});
