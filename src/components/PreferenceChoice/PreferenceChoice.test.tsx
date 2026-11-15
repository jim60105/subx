import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PreferenceChoice } from "./PreferenceChoice";

const OPTIONS = [
  { value: "a", label: "Option A" },
  { value: "b", label: "Option B" },
  { value: "c", label: "Option C" },
];

describe("PreferenceChoice", () => {
  it("renders one radio per option in a group named by its label", () => {
    render(<PreferenceChoice label="Pick one" value="b" options={OPTIONS} onChange={() => {}} />);

    const group = screen.getByRole("group", { name: "Pick one" });
    expect(within(group).getAllByRole("radio")).toHaveLength(OPTIONS.length);
    expect(screen.getByText("Pick one")).toBeVisible();
  });

  it("checks the current value only", () => {
    render(<PreferenceChoice label="Pick one" value="b" options={OPTIONS} onChange={() => {}} />);

    expect(screen.getByRole("radio", { name: "Option B" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Option A" })).not.toBeChecked();
    expect(screen.getByText("Option B")).toHaveAttribute("data-checked", "true");
    expect(screen.getByText("Option A")).toHaveAttribute("data-checked", "false");
  });

  it("calls onChange with the chosen value", async () => {
    const onChange = vi.fn();
    render(<PreferenceChoice label="Pick one" value="a" options={OPTIONS} onChange={onChange} />);

    await userEvent.click(screen.getByText("Option C"));

    expect(onChange).toHaveBeenCalledWith("c");
  });

  it("keeps two groups on one page independent", () => {
    render(
      <>
        <PreferenceChoice label="First" value="a" options={OPTIONS} onChange={() => {}} />
        <PreferenceChoice label="Second" value="c" options={OPTIONS} onChange={() => {}} />
      </>,
    );

    const first = within(screen.getByRole("group", { name: "First" })).getAllByRole("radio");
    const second = within(screen.getByRole("group", { name: "Second" })).getAllByRole("radio");
    expect(first[0]).toHaveAttribute("name");
    expect(first[0].getAttribute("name")).not.toBe(second[0].getAttribute("name"));
    expect(first[0]).toBeChecked();
    expect(second[2]).toBeChecked();
  });
});
