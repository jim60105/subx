import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { DropZone, KIND_CAPTIONS } from "./DropZone";
import type { IntakeKind } from "./DropZone";

const KINDS: IntakeKind[] = ["folder", "video", "subtitle", "archive"];
const DESCRIPTION = "Folders, individual files, and archives all work.";

function renderZone(compact: boolean, handlers = { onBrowseFiles: vi.fn(), onBrowseFolder: vi.fn() }) {
  const result = renderWithI18n(
    <DropZone kinds={KINDS} compact={compact} description={DESCRIPTION} {...handlers} />,
  );
  return { ...result, handlers };
}

function zone(): HTMLElement {
  return screen.getByRole("group", { name: "Drop files or folders anywhere on this window" });
}

beforeEach(async () => {
  await setupI18n("en");
});

describe("DropZone", () => {
  // source-intake: "Drop zone demonstrates the accepted inputs" / "Empty drop zone shows every accepted kind"
  it("renders the large form with one captioned glyph per kind, in order", () => {
    renderZone(false);

    expect(zone()).toHaveAttribute("data-state", "large");
    const items = [...zone().querySelectorAll<HTMLElement>(".drop-zone__kinds [data-kind]")];
    expect(items.map((item) => item.dataset.kind)).toEqual(KINDS);
    expect(items.map((item) => item.querySelector(".drop-zone__caption")?.textContent)).toEqual([
      "Folder",
      KIND_CAPTIONS.video,
      KIND_CAPTIONS.subtitle,
      KIND_CAPTIONS.archive,
    ]);
    for (const item of items) expect(item.querySelector("svg")).not.toBeNull();
  });

  // source-intake: "Drop zone demonstrates the accepted inputs" / "Drop zone collapses after the first source"
  it("collapses to a strip that keeps every glyph and both browse actions", async () => {
    const user = userEvent.setup();
    const { handlers } = renderZone(true);

    expect(zone()).toHaveAttribute("data-state", "compact");
    const items = zone().querySelectorAll(".drop-zone__kinds [data-kind]");
    expect(items).toHaveLength(KINDS.length);
    expect(zone().querySelector(".drop-zone__caption")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Browse files" }));
    expect(handlers.onBrowseFiles).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Browse folder" }));
    expect(handlers.onBrowseFolder).toHaveBeenCalledOnce();
  });

  // source-intake: "Drop zone demonstrates the accepted inputs" / "Description is kept for assistive technology"
  it.each([false, true])("keeps the description for assistive technology (compact: %s)", (compact) => {
    renderZone(compact);

    expect(zone()).toHaveAccessibleDescription(DESCRIPTION);
    expect(screen.getByText(DESCRIPTION)).toHaveClass("visually-hidden");
    expect(zone().querySelector(".drop-zone__kinds")).toHaveAttribute("aria-hidden", "true");
  });
});
