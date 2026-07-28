import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { TaskCard } from "./TaskCard";

describe("task card", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  it("navigates when enabled and selected", async () => {
    const onSelect = vi.fn();
    renderWithI18n(
      <TaskCard name="Match subtitles" description="Pair subtitles with videos." icon={<span />} onSelect={onSelect} />,
    );

    await userEvent.click(screen.getByRole("button", { name: /Match subtitles/ }));

    expect(onSelect).toHaveBeenCalled();
  });

  // @covers app-shell/desktop-application-launches-with-the-home-task-entry-hub#unimplemented-features-are-visibly-disabled
  it("shows a disabled 'coming soon' card for a task whose feature is not yet implemented, and does not navigate", async () => {
    const onSelect = vi.fn();
    renderWithI18n(
      <TaskCard name="Future task" description="Not built yet." icon={<span />} disabled onSelect={onSelect} />,
    );

    const card = screen.getByRole("button", { name: /Future task/ });
    expect(card).toBeDisabled();
    expect(card).toHaveTextContent("Coming soon");

    await userEvent.click(card);

    expect(onSelect).not.toHaveBeenCalled();
  });
});
