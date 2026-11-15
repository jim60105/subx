import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { GroupedFileList } from "./GroupedFileList";

const INTERLEAVED = ["/a/1.mkv", "/b/1.ass", "/a/2.mkv", "/b/2.ass", "/a/3.mkv"];

function renderList(paths: string[], onRemove = vi.fn()) {
  const result = renderWithI18n(<GroupedFileList paths={paths} label="Selected sources" onRemove={onRemove} />);
  return { ...result, onRemove };
}

function groups(): HTMLElement[] {
  return [...document.querySelectorAll<HTMLElement>(".file-groups__group")];
}

beforeEach(async () => {
  await setupI18n("en");
});

describe("GroupedFileList", () => {
  // @covers source-intake/sources-are-listed-in-folder-groups#entries-are-grouped-by-parent-folder
  it("shows two folder groups in first-seen order, each with its own entries", () => {
    renderList(INTERLEAVED);

    expect(screen.getByRole("group", { name: "Selected sources" })).toHaveClass("file-groups");
    const [first, second, ...rest] = groups();
    expect(rest).toEqual([]);
    expect(first).toHaveAccessibleName("/a/");
    expect(within(first).getByText("/a/")).toHaveClass("file-groups__folder");
    expect(first.querySelector(".file-groups__count")).toHaveTextContent("3");
    expect(within(first).getAllByRole("listitem").map((item) => item.textContent)).toEqual([
      "1.mkv✕",
      "2.mkv✕",
      "3.mkv✕",
    ]);
    expect(second).toHaveAccessibleName("/b/");
    expect(second.querySelector(".file-groups__count")).toHaveTextContent("2");
    expect(within(second).getAllByRole("listitem")).toHaveLength(2);
    expect(within(second).queryByText("1.mkv")).not.toBeInTheDocument();
  });

  // @covers source-intake/sources-are-listed-in-folder-groups#removing-a-group-removes-all-of-its-entries
  it("asks once for every path of a group when the group is removed", async () => {
    const user = userEvent.setup();
    const { onRemove } = renderList(INTERLEAVED);

    await user.click(screen.getByRole("button", { name: "Remove all 2 items in /b/" }));

    expect(onRemove).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledWith(["/b/1.ass", "/b/2.ass"]);
  });

  // @covers source-intake/sources-are-listed-in-folder-groups#kind-glyph-follows-the-extension
  it("marks each entry with the kind its extension implies", () => {
    renderList(["/m/a.mkv", "/m/a.ass", "/m/a.zip", "/m/season1", "/m/a.txt"]);

    const kinds = [...document.querySelectorAll<HTMLElement>(".file-groups__entry")].map(
      (entry) => entry.dataset.kind,
    );
    expect(kinds).toEqual(["video", "subtitle", "archive", "folder", "other"]);
    for (const entry of document.querySelectorAll(".file-groups__entry")) {
      expect(entry.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
    }
  });

  // @covers source-intake/sources-are-listed-in-folder-groups#remove-action-is-reachable-by-keyboard
  it("reaches an entry's remove button by keyboard and removes exactly that source", async () => {
    const user = userEvent.setup();
    const { onRemove } = renderList(["/m/a.mkv", "/m/b.mkv"]);
    const target = screen.getByRole("button", { name: "Remove b.mkv" });

    for (let step = 0; step < 10 && document.activeElement !== target; step += 1) await user.tab();

    expect(document.activeElement).toBe(target);
    expect(target.tagName).toBe("BUTTON");
    await user.keyboard("{Enter}");
    expect(onRemove).toHaveBeenCalledOnce();
    expect(onRemove).toHaveBeenCalledWith(["/m/b.mkv"]);
  });

  it("puts the group's remove action before its entries in tab order", async () => {
    const user = userEvent.setup();
    renderList(["/m/a.mkv"]);

    await user.tab();
    expect(screen.getByRole("button", { name: "Remove all 1 items in /m/" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Remove a.mkv" })).toHaveFocus();
  });
});
