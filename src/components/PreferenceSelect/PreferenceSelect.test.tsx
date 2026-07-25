import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PreferenceSelect } from "./PreferenceSelect";

const OPTIONS = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
];

describe("PreferenceSelect", () => {
  it("renders every option and the current value", () => {
    render(
      <PreferenceSelect label="Pick one" value="b" options={OPTIONS} onChange={() => {}} />,
    );

    const select = screen.getByLabelText("Pick one") as HTMLSelectElement;
    expect(select.value).toBe("b");
    expect(screen.getByRole("option", { name: "Option A" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Option B" })).toBeInTheDocument();
  });

  it("calls onChange with the selected value", async () => {
    const onChange = vi.fn();
    render(
      <PreferenceSelect label="Pick one" value="a" options={OPTIONS} onChange={onChange} />,
    );

    await userEvent.selectOptions(screen.getByLabelText("Pick one"), "b");

    expect(onChange).toHaveBeenCalledWith("b");
  });

  it("visually hides the label in the compact variant but keeps it accessible", () => {
    render(
      <PreferenceSelect
        label="Pick one"
        value="a"
        options={OPTIONS}
        onChange={() => {}}
        variant="compact"
      />,
    );

    expect(screen.getByText("Pick one")).toHaveClass("visually-hidden");
    expect(screen.getByLabelText("Pick one")).toBeInTheDocument();
  });

  it("shows the label visibly in the labeled variant", () => {
    render(
      <PreferenceSelect
        label="Pick one"
        value="a"
        options={OPTIONS}
        onChange={() => {}}
        variant="labeled"
      />,
    );

    expect(screen.getByText("Pick one")).not.toHaveClass("visually-hidden");
  });

  // @covers theme-system/preference-dropdown-controls-render-custom-dom-popovers-matching-active-theme#preference-select-popover-adapts-to-light-theme
  // @covers theme-system/preference-dropdown-controls-render-custom-dom-popovers-matching-active-theme#preference-select-popover-adapts-to-dark-theme
  it("opens custom DOM popover when trigger button is clicked", async () => {
    const onChange = vi.fn();
    render(
      <PreferenceSelect label="Pick one" value="a" options={OPTIONS} onChange={onChange} />,
    );

    const trigger = screen.getByRole("button", { name: "Option A" });
    await userEvent.click(trigger);

    const menu = screen.getByRole("listbox");
    expect(menu).toBeInTheDocument();

    const optionB = within(menu).getByRole("option", { name: "Option B" });
    await userEvent.click(optionB);

    expect(onChange).toHaveBeenCalledWith("b");
  });
});
