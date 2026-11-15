import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { TaskRow } from "./TaskRow";

describe("task row", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  it("selects its task when enabled", async () => {
    const onSelect = vi.fn();
    renderWithI18n(
      <TaskRow
        ordinal={1}
        name="Match subtitles"
        description="Pair subtitles with videos."
        specimen={<span>sample</span>}
        onSelect={onSelect}
      />,
    );

    const row = screen.getByRole("button", { name: "Match subtitles" });
    expect(row).toHaveAccessibleDescription("Pair subtitles with videos.");
    expect(row).toHaveTextContent(/^01/);
    await userEvent.click(row);

    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("shows a disabled 'coming soon' row for an unimplemented task and does not select it", async () => {
    const onSelect = vi.fn();
    renderWithI18n(
      <TaskRow
        ordinal={2}
        name="Future task"
        description="Not built yet."
        specimen={<span>sample</span>}
        disabled
        onSelect={onSelect}
      />,
    );

    const row = screen.getByRole("button", { name: /Future task/ });
    expect(row).toBeDisabled();
    expect(row).toHaveTextContent("Coming soon");

    await userEvent.click(row);

    expect(onSelect).not.toHaveBeenCalled();
  });
});
