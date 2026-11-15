import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { SYNC_DEFAULTS } from "../../test/screenFixtures";
import { SyncMethodStep } from "./SyncMethodStep";

const HINT = "Lower is stricter: quieter passages are less likely to count as speech.";

describe("the sync method step", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  // @covers sync-workflow/sensitivity-slider-labels-both-ends#both-ends-are-labelled
  it("labels both ends of the sensitivity slider and keeps the sentence as its description", () => {
    renderWithI18n(
      <SyncMethodStep
        method="auto"
        hasMedia
        defaults={SYNC_DEFAULTS}
        defaultsError={undefined}
        sensitivity={50}
        offsetMs={0}
        offsetExceedsMax={false}
        onMethodChange={() => {}}
        onSensitivityChange={() => {}}
        onOffsetChange={() => {}}
      />,
    );

    expect(screen.getByText("Stricter")).toBeVisible();
    expect(screen.getByText("More sensitive")).toBeVisible();

    const slider = screen.getByRole("slider", { name: /Speech sensitivity/ });
    expect(slider).toHaveAccessibleDescription(HINT);
    expect(slider).not.toHaveAccessibleName(/Stricter|More sensitive/);
    expect(screen.getByText(HINT)).toHaveClass("visually-hidden");
  });
});
