import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { ReactElement } from "react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it } from "vitest";

import { SUPPORTED_LANGUAGES } from "../../i18n/languages";
import { i18n, renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { formatSeconds, NUDGE_STEP_MS, OffsetField } from "./OffsetField";

function StatefulOffsetField({ initial = 0 }: { initial?: number }) {
  const [offsetMs, setOffsetMs] = useState(initial);
  return (
    <OffsetField offsetMs={offsetMs} maxOffsetMs={60_000} exceedsMax={false} onChange={setOffsetMs} />
  );
}

/** `rerender` replaces the whole tree, so it needs the provider again to update rather than remount. */
const withI18n = (ui: ReactElement) => <I18nextProvider i18n={i18n}>{ui}</I18nextProvider>;

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
    const increase = screen.getByRole("button", { name: /^\+50 ms/ });
    const decrease = screen.getByRole("button", { name: /^−50 ms/ });

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
    const increase = screen.getByRole("button", { name: /^\+50 ms/ });
    const decrease = screen.getByRole("button", { name: /^−50 ms/ });

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

  it("shows a notice as a status and adds it to the field's description", () => {
    const hint = "A positive value delays the subtitles; a negative one makes them appear sooner.";
    const { rerender } = renderWithI18n(
      <OffsetField offsetMs={0} maxOffsetMs={60_000} exceedsMax={false} notice="Reason text" onChange={() => {}} />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("Reason text");
    expect(field()).toHaveAccessibleDescription(`${hint} Reason text`);

    rerender(withI18n(<OffsetField offsetMs={0} maxOffsetMs={60_000} exceedsMax={false} onChange={() => {}} />));

    // The live region stays mounted and empty, so the next notice is announced as a change.
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
    expect(screen.getByRole("status")).not.toHaveClass("offset-field__notice");
    expect(field()).toHaveAccessibleDescription(hint);

    rerender(withI18n(<OffsetField offsetMs={0} maxOffsetMs={60_000} exceedsMax={false} notice="Reason text" onChange={() => {}} />));
    expect(screen.getByRole("status")).toHaveTextContent("Reason text");
  });

  it("takes focus on arrival with a notice only when focus has nowhere useful to be", () => {
    const outside = document.createElement("button");
    document.body.append(outside);
    try {
      const first = renderWithI18n(
        <OffsetField offsetMs={0} maxOffsetMs={60_000} exceedsMax={false} notice="Reason text" onChange={() => {}} />,
      );
      expect(field()).toHaveFocus();
      first.unmount();

      // A disabled control holding focus is as good as nowhere.
      outside.focus();
      outside.disabled = true;
      const second = renderWithI18n(
        <OffsetField offsetMs={0} maxOffsetMs={60_000} exceedsMax={false} notice="Reason text" onChange={() => {}} />,
      );
      expect(field()).toHaveFocus();
      second.unmount();

      // Focus the user placed on a live control stays there, and so does
      // focus when the field arrives without a notice.
      outside.disabled = false;
      outside.focus();
      const third = renderWithI18n(
        <OffsetField offsetMs={0} maxOffsetMs={60_000} exceedsMax={false} notice="Reason text" onChange={() => {}} />,
      );
      expect(outside).toHaveFocus();
      third.unmount();

      // A notice that appears after mount, while editing, never moves focus.
      outside.blur();
      const { rerender } = renderWithI18n(
        <OffsetField offsetMs={250} maxOffsetMs={60_000} exceedsMax={false} onChange={() => {}} />,
      );
      expect(field()).not.toHaveFocus();
      rerender(withI18n(<OffsetField offsetMs={0} maxOffsetMs={60_000} exceedsMax={false} notice="Reason text" onChange={() => {}} />));
      expect(field()).not.toHaveFocus();
    } finally {
      outside.remove();
    }
  });
});

describe("the nudge controls' accessible names", () => {
  // @covers sync-workflow/nudge-controls-accessible-names-begin-with-their-visible-text#names-begin-with-the-visible-text-in-each-locale
  it.each(SUPPORTED_LANGUAGES)("begin with the visible text in %s", async (language) => {
    await setupI18n(language);
    const { container } = renderWithI18n(<StatefulOffsetField />);
    const buttons = [...container.querySelectorAll(".offset-field__nudge button")];

    expect(buttons).toHaveLength(2);
    for (const button of buttons) {
      expect(button.textContent).not.toBe("");
      expect(button.getAttribute("aria-label")!.startsWith(button.textContent!)).toBe(true);
    }
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
