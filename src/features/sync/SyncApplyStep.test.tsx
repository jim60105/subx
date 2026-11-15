import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, describe, expect, it } from "vitest";

import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { SyncApplyStep } from "./SyncApplyStep";

function StatefulApplyStep({ subtitlePath }: { subtitlePath: string | null }) {
  const [outputPath, setOutputPath] = useState("/media/movie_synced.srt");
  return (
    <SyncApplyStep
      offsetMs={1500}
      subtitlePath={subtitlePath}
      outputPath={outputPath}
      applyResult={null}
      applyError={undefined}
      onOutputPathChange={setOutputPath}
    />
  );
}

const line = (container: HTMLElement, kind: "kept" | "created") =>
  container.querySelector(`.diff-line[data-kind="${kind}"] .diff-line__text`);

describe("the sync apply step", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  it("shows the source as a kept line and the output as a created line", async () => {
    const user = userEvent.setup();
    const { container } = renderWithI18n(<StatefulApplyStep subtitlePath="/media/movie.srt" />);

    expect(line(container, "kept")).toHaveTextContent(/^movie\.srt$/);
    expect(line(container, "created")).toHaveTextContent(/^movie_synced\.srt$/);
    expect(screen.queryByText(/never changed/)).not.toBeInTheDocument();

    const output = screen.getByRole("textbox", { name: "Save to" });
    await user.clear(output);
    await user.type(output, "/elsewhere/renamed.srt");

    expect(line(container, "created")).toHaveTextContent(/^renamed\.srt$/);
    expect(line(container, "kept")).toHaveTextContent(/^movie\.srt$/);
  });

  it("omits the kept line when no subtitle is known", () => {
    const { container } = renderWithI18n(<StatefulApplyStep subtitlePath={null} />);

    expect(line(container, "kept")).toBeNull();
    expect(line(container, "created")).toHaveTextContent("movie_synced.srt");
  });

  it("hides the diff once the file has been written", () => {
    const { container } = renderWithI18n(
      <SyncApplyStep
        offsetMs={1500}
        subtitlePath="/media/movie.srt"
        outputPath="/media/movie_synced.srt"
        applyResult={{ outputPath: "/media/movie_synced.srt", overwritten: false }}
        applyError={undefined}
        onOutputPathChange={() => {}}
      />,
    );

    expect(container.querySelector(".diff-preview")).toBeNull();
  });
});
