import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { DiffPreview } from "./DiffPreview";
import type { DiffLineSpec } from "./DiffPreview";

const LINES: DiffLineSpec[] = [
  { kind: "removed", text: "subs/03.ass" },
  { kind: "created", text: "subs/S01E03.ass" },
  { kind: "kept", text: "video/03.mkv" },
];

function lineOf(container: HTMLElement, kind: string): HTMLElement {
  const line = container.querySelector<HTMLElement>(`.diff-line[data-kind="${kind}"]`);
  if (line === null) throw new Error(`no ${kind} line`);
  return line;
}

function markOf(line: HTMLElement): HTMLElement {
  const mark = line.querySelector<HTMLElement>(".diff-line__mark");
  if (mark === null) throw new Error("line has no mark");
  return mark;
}

beforeEach(async () => {
  await setupI18n("en");
});

describe("DiffPreview", () => {
  // @covers diff-preview/file-consequences-render-as-marked-lines#each-kind-has-its-own-mark
  it("gives removed and created lines distinct marks and leaves a kept line unmarked", () => {
    const { container } = renderWithI18n(<DiffPreview lines={LINES} label="Outcome" />);

    const removed = markOf(lineOf(container, "removed")).textContent;
    const created = markOf(lineOf(container, "created")).textContent;
    expect(removed).not.toBe("");
    expect(created).not.toBe("");
    expect(removed).not.toBe(created);
    expect(markOf(lineOf(container, "kept")).textContent).toBe("");
    expect(container.querySelectorAll(".diff-line[data-kind]")).toHaveLength(3);
  });

  // @covers diff-preview/file-consequences-render-as-marked-lines#kinds-are-announced-as-text
  it("names each line's kind in localized text and hides the mark", async () => {
    const { container } = renderWithI18n(<DiffPreview lines={LINES} label="Outcome" />);

    const list = screen.getByRole("list", { name: "Outcome" });
    expect(list).not.toHaveAttribute("aria-hidden");
    for (const [kind, text] of [
      ["removed", "removed"],
      ["created", "created"],
      ["kept", "unchanged"],
    ]) {
      const line = lineOf(container, kind);
      expect(line.querySelector(".visually-hidden")).toHaveTextContent(text);
      expect(markOf(line)).toHaveAttribute("aria-hidden", "true");
    }

    await setupI18n("zh-TW");
    const zh = renderWithI18n(<DiffPreview lines={LINES} />);
    expect(lineOf(zh.container, "removed").querySelector(".visually-hidden")).toHaveTextContent("移除");
    await setupI18n("en");
  });

  // @covers diff-preview/file-consequences-render-as-marked-lines#a-decorative-preview-is-hidden-from-assistive-technology
  it("hides a decorative preview from the accessibility tree", () => {
    const { container } = renderWithI18n(<DiffPreview lines={LINES} decorative />);

    expect(container.querySelector(".diff-preview")).toHaveAttribute("aria-hidden", "true");
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });
});
