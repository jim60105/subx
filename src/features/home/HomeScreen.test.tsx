import { screen, within } from "@testing-library/react";
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

  it("lists the four tasks as one numbered list, one control per entry", () => {
    renderWithI18n(<HomeScreen onOpenTask={() => {}} />);

    const lists = screen.getAllByRole("list");
    expect(lists).toHaveLength(1);
    expect(lists[0].tagName).toBe("OL");
    const items = within(lists[0]).getAllByRole("listitem");
    expect(items).toHaveLength(4);
    expect(
      items.map((item) => {
        const buttons = within(item).getAllByRole("button");
        expect(buttons).toHaveLength(1);
        return buttons[0];
      }),
    ).toEqual(
      ["Match subtitles", "Convert format", "Sync timing", "Translate"].map((name) =>
        screen.getByRole("button", { name }),
      ),
    );
  });

  it("gives every entry a hidden specimen and describes it with the task description", () => {
    const { container } = renderWithI18n(<HomeScreen onOpenTask={() => {}} />);

    const rows = [...container.querySelectorAll(".home__task")];
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(row.querySelectorAll('.task-row__specimen[aria-hidden="true"]')).toHaveLength(1);
    }

    const descriptions: Record<string, string> = {
      "Match subtitles": "Pair subtitle files with the right videos using AI, then rename, copy, or move them.",
      "Convert format": "Convert subtitles between SRT, ASS, VTT, and SUB.",
      "Sync timing": "Align subtitle timing with the audio track automatically.",
      Translate: "Translate subtitles into another language with AI.",
    };
    for (const [name, description] of Object.entries(descriptions)) {
      expect(screen.getByRole("button", { name })).toHaveAccessibleDescription(description);
    }
  });

  it("renders a specimen for each task from its sample values", () => {
    const { container } = renderWithI18n(<HomeScreen onOpenTask={() => {}} />);
    const specimens = [...container.querySelectorAll(".task-row__specimen")].map((s) => s.textContent);

    expect(specimens).toEqual([
      "S01E03.mkv⟷[Sub] 03.ass",
      ".srt→.ass.vtt.sub",
      "00:01:12,400→00:01:13,150",
      "Long time no see.→好久不見。",
    ]);
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
