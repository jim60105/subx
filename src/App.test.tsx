import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { invoke } from "@tauri-apps/api/core";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import App from "./App";
import { renderWithI18n, setupI18n } from "./test/renderWithI18n";
import { ThemeProvider } from "./theme/ThemeProvider";
import type { PingResponse } from "./types/ipc";

describe("app shell", () => {
  beforeEach(async () => {
    await setupI18n("en");
  });

  afterEach(() => {
    clearMocks();
  });

  it("starts on the home hub", () => {
    renderWithI18n(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    expect(screen.getByRole("heading", { name: "What would you like to do?" })).toBeInTheDocument();
  });

  it("navigates into a feature and back without losing the hub", async () => {
    renderWithI18n(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /Match subtitles/ }));
    expect(screen.getByRole("heading", { name: "Match subtitles" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByRole("heading", { name: "What would you like to do?" })).toBeInTheDocument();
  });

  it("opens settings from the header and returns to the hub", async () => {
    mockIPC((command) => {
      if (command === "get_config") {
        return {
          ai: {
            provider: "openai",
            model: "gpt-4.1-mini",
            baseUrl: "https://api.openai.com/v1",
            apiKeyMasked: "",
            apiKeySet: false,
          },
        };
      }
      throw new Error(`unexpected command: ${command}`);
    });

    renderWithI18n(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByRole("heading", { name: "What would you like to do?" })).toBeInTheDocument();
  });

  it("round-trips the ping command over mocked IPC", async () => {
    mockIPC((command) => {
      if (command === "ping") {
        return { message: "pong", appVersion: "0.1.0" } satisfies PingResponse;
      }
      throw new Error(`unexpected command: ${command}`);
    });

    await expect(invoke<PingResponse>("ping")).resolves.toEqual({
      message: "pong",
      appVersion: "0.1.0",
    });
  });
});
