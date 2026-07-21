import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { renderWithI18n, setupI18n } from "../test/renderWithI18n";
import type { ErrorDto } from "../types/ipc";
import { useLocalizedError } from "./useLocalizedError";

function ErrorProbe({ error }: { error: unknown }) {
  const localize = useLocalizedError();
  const localized = localize(error);
  return (
    <div>
      <span data-testid="message">{localized.message}</span>
      <span data-testid="hint">{localized.hint ?? ""}</span>
      <span data-testid="detail">{localized.detail}</span>
      <span data-testid="known">{String(localized.isKnown)}</span>
    </div>
  );
}

describe("error-code localization", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  it("localizes a known code", () => {
    const error: ErrorDto = { code: "core.internal", message: "thread panicked" };
    renderWithI18n(<ErrorProbe error={error} />);

    expect(screen.getByTestId("message")).toHaveTextContent(
      "An unexpected internal error occurred.",
    );
    expect(screen.getByTestId("detail")).toHaveTextContent("thread panicked");
    expect(screen.getByTestId("known")).toHaveTextContent("true");
  });

  it("falls back to a generic message for an unknown code, keeping the raw detail", () => {
    const error: ErrorDto = { code: "match.not_a_real_code", message: "engine exploded" };
    renderWithI18n(<ErrorProbe error={error} />);

    expect(screen.getByTestId("message")).toHaveTextContent("Something went wrong.");
    expect(screen.getByTestId("detail")).toHaveTextContent("engine exploded");
    expect(screen.getByTestId("known")).toHaveTextContent("false");
  });

  it("localizes a known hint code and omits unknown ones", () => {
    renderWithI18n(
      <ErrorProbe error={{ code: "core.internal", message: "x", hintCode: "core.retry" }} />,
    );
    expect(screen.getByTestId("hint")).not.toBeEmptyDOMElement();

    renderWithI18n(
      <ErrorProbe error={{ code: "core.internal", message: "x", hintCode: "core.nope" }} />,
    );
    expect(screen.getAllByTestId("hint")[1]).toBeEmptyDOMElement();
  });

  it("resolves the crate-category codes the backend emits, hint included", () => {
    renderWithI18n(
      <ErrorProbe
        error={{
          code: "core.ai_service",
          message: "connection refused",
          hintCode: "core.ai_service.hint",
        }}
      />,
    );

    expect(screen.getByTestId("message")).toHaveTextContent("The AI service could not be reached.");
    expect(screen.getByTestId("hint")).toHaveTextContent(
      "Check your network connection and the configured API key.",
    );
    expect(screen.getByTestId("known")).toHaveTextContent("true");
  });

  it("handles a rejection that is not an ErrorDto at all", () => {
    renderWithI18n(<ErrorProbe error="boom" />);

    expect(screen.getByTestId("message")).toHaveTextContent(
      "An unexpected internal error occurred.",
    );
    expect(screen.getByTestId("detail")).toHaveTextContent("boom");
  });

  it("renders the localized message in the active language", async () => {
    await setupI18n("zh-TW");
    renderWithI18n(<ErrorProbe error={{ code: "core.internal", message: "x" }} />);

    expect(screen.getByTestId("message")).toHaveTextContent("發生未預期的內部錯誤。");
  });
});
