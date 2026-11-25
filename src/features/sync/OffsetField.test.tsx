import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { formatSeconds, NUDGE_STEP_MS, OffsetField } from "./OffsetField";

function StatefulOffsetField({ initial = 0 }: { initial?: number }) {
  const [offsetMs, setOffsetMs] = useState(initial);
  return (
    <OffsetField offsetMs={offsetMs} maxOffsetMs={60_000} exceedsMax={false} onChange={setOffsetMs} />
  );
}

const field = () => screen.getByRole("spinbutton", { name: "Offset in milliseconds" });
const figure = (container: HTMLElement) => container.querySelector(".offset-field__figure");

describe("the offset field", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  // @covers sync-workflow/offset-is-shown-as-a-nudgeable-figure-with-a-time-rule#nudge-controls-step-the-offset
  it("steps the offset with the nudge controls and keeps the figure and field in agreement", async () => {
    const user = userEvent.setup();
    const { container } = renderWithI18n(<StatefulOffsetField />);
    const increase = screen.getByRole("button", { name: `Increase by ${NUDGE_STEP_MS} ms` });
    const decrease = screen.getByRole("button", { name: `Decrease by ${NUDGE_STEP_MS} ms` });

    expect(increase).toHaveTextContent("+50 ms");
    expect(decrease).toHaveTextContent("\u221250 ms");

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

  it("moves the figure in the direction of each change, and not on first render", async () => {
    const user = userEvent.setup();
    const { container } = renderWithI18n(<StatefulOffsetField />);
    const increase = screen.getByRole("button", { name: `Increase by ${NUDGE_STEP_MS} ms` });
    const decrease = screen.getByRole("button", { name: `Decrease by ${NUDGE_STEP_MS} ms` });

    expect(figure(container)).not.toHaveAttribute("data-direction");

    await user.click(increase);
    expect(figure(container)).toHaveAttribute("data-direction", "up");

    await user.click(decrease);
    expect(figure(container)).toHaveAttribute("data-direction", "down");
  });

  it("keeps the label for assistive technology only and renders the step's facts in the row", () => {
    renderWithI18n(
      <OffsetField offsetMs={0} maxOffsetMs={60_000} exceedsMax={false} onChange={() => {}}>
        <span>facts</span>
      </OffsetField>,
    );

    expect(screen.getByText("Offset in milliseconds")).toHaveClass("visually-hidden");
    expect(screen.getByText("facts").closest(".offset-field__row")).not.toBeNull();
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
