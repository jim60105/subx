import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { HomeScreen } from "./HomeScreen";

describe("home task-entry hub", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  it("shows a card for every task", () => {
    renderWithI18n(<HomeScreen onOpenTask={() => {}} />);

    for (const name of ["Match subtitles", "Convert format", "Sync timing", "Translate"]) {
      expect(screen.getByRole("button", { name: new RegExp(name) })).toBeInTheDocument();
    }
  });

  it("navigates when an implemented task is selected", async () => {
    const onOpenTask = vi.fn();
    renderWithI18n(<HomeScreen onOpenTask={onOpenTask} />);

    await userEvent.click(screen.getByRole("button", { name: /Match subtitles/ }));

    expect(onOpenTask).toHaveBeenCalledWith("match");
  });

  it("marks unimplemented tasks as coming soon and does not navigate", async () => {
    const onOpenTask = vi.fn();
    renderWithI18n(<HomeScreen onOpenTask={onOpenTask} />);

    const convert = screen.getByRole("button", { name: /Convert format/ });
    expect(convert).toBeDisabled();
    expect(convert).toHaveTextContent("Coming soon");

    await userEvent.click(convert);

    expect(onOpenTask).not.toHaveBeenCalled();
  });
});
