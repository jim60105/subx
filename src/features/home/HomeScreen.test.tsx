import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { HomeScreen } from "./HomeScreen";

describe("home task-entry hub", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  // @covers app-shell/desktop-application-launches-with-the-home-task-entry-hub#first-launch-shows-the-hub
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

  it("opens the convert wizard from its card", async () => {
    const onOpenTask = vi.fn();
    renderWithI18n(<HomeScreen onOpenTask={onOpenTask} />);

    const convert = screen.getByRole("button", { name: /Convert format/ });
    expect(convert).toBeEnabled();
    await userEvent.click(convert);

    expect(onOpenTask).toHaveBeenCalledWith("convert");
  });

  it("opens the sync wizard from its card", async () => {
    const onOpenTask = vi.fn();
    renderWithI18n(<HomeScreen onOpenTask={onOpenTask} />);

    const sync = screen.getByRole("button", { name: /Sync timing/ });
    expect(sync).toBeEnabled();
    await userEvent.click(sync);

    expect(onOpenTask).toHaveBeenCalledWith("sync");
  });

  it("opens the translate wizard from its card", async () => {
    const onOpenTask = vi.fn();
    renderWithI18n(<HomeScreen onOpenTask={onOpenTask} />);

    // Translate was the last card to be built; every hub card is now live.
    const translate = screen.getByRole("button", { name: /Translate/ });
    expect(translate).toBeEnabled();
    await userEvent.click(translate);

    expect(onOpenTask).toHaveBeenCalledWith("translate");
  });
});
