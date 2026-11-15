import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import type { RelocationModeDto } from "../../types/ipc";
import { SourcesStep } from "./SourcesStep";

/** 200 sources across four folders: far more than any window shows. */
const MANY = Array.from({ length: 200 }, (_, index) => `/media/season${index % 4}/ep${index}.mkv`);

function renderStep(sources: string[], mode: RelocationModeDto = "rename") {
  const handlers = {
    onBrowseFiles: vi.fn(),
    onBrowseFolder: vi.fn(),
    onRemoveSources: vi.fn(),
    onModeChange: vi.fn(),
  };
  const result = renderWithI18n(
    <SourcesStep
      sources={sources}
      scan={{ videoCount: 200, subtitleCount: 31 }}
      isScanning={false}
      scanError={undefined}
      mode={mode}
      {...handlers}
    />,
  );
  return { ...result, handlers };
}

const OPTIONS = [
  { name: "Rename in place", hint: "Rename the subtitle where it already sits.", kinds: ["removed", "created"] },
  {
    name: "Copy to the video",
    hint: "Keep the original and place a renamed copy beside the video.",
    kinds: ["kept", "created"],
  },
  { name: "Move to the video", hint: "Move the subtitle next to the video.", kinds: ["removed", "created"] },
];

beforeEach(async () => {
  await setupI18n("en");
});

describe("the match sources step", () => {
  // match-workflow: "Multi-source selection with scan preview and relocation mode" / "Relocation choice stays outside the scrolling list"
  it("renders the relocation choice outside the list, which holds only sources", () => {
    const { container } = renderStep(MANY);

    const list = container.querySelector<HTMLElement>(".file-groups");
    if (list === null) throw new Error("no source list");
    const choice = screen.getByRole("group", { name: "When a match is found" });
    expect(list.contains(choice)).toBe(false);
    expect(within(list).queryAllByRole("radio")).toEqual([]);
    expect(list.querySelectorAll(".file-groups__entry")).toHaveLength(200);
    expect(container.querySelectorAll(".file-groups")).toHaveLength(1);
  });

  // match-workflow: "Multi-source selection with scan preview and relocation mode" / "Each relocation option demonstrates its effect"
  it("shows each option's effect as a diff and keeps its sentence as the description", () => {
    const { container } = renderStep(["/media/ep01.mkv"]);

    const labels = [...container.querySelectorAll<HTMLElement>(".sources-step__mode")];
    expect(labels).toHaveLength(OPTIONS.length);
    OPTIONS.forEach(({ name, hint, kinds }, index) => {
      const lines = [...labels[index].querySelectorAll<HTMLElement>(".diff-line")];
      expect(lines.map((line) => line.dataset.kind)).toEqual(kinds);

      const radio = screen.getByRole("radio", { name });
      expect(labels[index].contains(radio)).toBe(true);
      expect(radio).toHaveAccessibleName(name);
      expect(radio).toHaveAccessibleDescription(hint);
      for (const text of screen.getAllByText(hint)) {
        expect(text.closest(".visually-hidden")).not.toBeNull();
      }
    });
  });

  it("marks the selected option and reports a new choice", async () => {
    const user = userEvent.setup();
    const { container, handlers } = renderStep(["/media/ep01.mkv"], "copy");

    const checked = container.querySelector('.sources-step__mode[data-checked="true"]');
    expect(checked).toContainElement(screen.getByRole("radio", { name: "Copy to the video" }));
    expect(screen.getByRole("radio", { name: "Copy to the video" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Move to the video" }));
    expect(handlers.onModeChange).toHaveBeenCalledWith("move");
  });

  it("shows the scan totals as figures with their nouns", () => {
    const { container } = renderStep(["/media/ep01.mkv"]);

    const tallies = [...container.querySelectorAll(".sources-step__tally")].map((tally) => tally.textContent);
    expect(tallies).toEqual(["200 videos", "31 subtitles"]);
    expect(container.querySelector(".sources-step__figure")).toHaveClass("serif");
  });

  it("forwards a group removal to the wizard", async () => {
    const user = userEvent.setup();
    const { handlers } = renderStep(["/a/1.mkv", "/b/1.ass", "/a/2.mkv"]);

    await user.click(screen.getByRole("button", { name: "Remove all 2 items in /a/" }));
    expect(handlers.onRemoveSources).toHaveBeenCalledWith(["/a/1.mkv", "/a/2.mkv"]);
  });

  it("keeps the title and description for assistive technology only", () => {
    renderStep([]);

    expect(screen.getByRole("heading", { level: 2, name: "Choose your sources" })).toHaveClass("visually-hidden");
    expect(document.querySelector(".drop-zone")).toHaveAttribute("data-state", "large");
    expect(screen.queryByRole("group", { name: "Selected sources" })).not.toBeInTheDocument();
  });
});
