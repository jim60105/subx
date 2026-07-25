import { clearMocks, mockIPC } from "@tauri-apps/api/mocks";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The match wizard subscribes to window file drops on mount and opens native
// pickers; neither is exercised here, so the platform modules are stubbed.
vi.mock("@tauri-apps/api/webview", () => ({
  getCurrentWebview: () => ({ onDragDropEvent: () => Promise.resolve(() => {}) }),
}));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import App from "./App";
import { commands } from "./types/bindings";
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

  // @covers app-shell/desktop-application-launches-with-the-home-task-entry-hub#first-launch-shows-the-hub
  it("starts on the home hub", () => {
    renderWithI18n(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    expect(screen.getByRole("heading", { name: "What would you like to do?" })).toBeInTheDocument();
  });

  // @covers app-shell/navigation-between-home-and-feature-screens#enter-and-leave-a-feature
  it("navigates into a feature and back without losing the hub", async () => {
    renderWithI18n(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /Match subtitles/ }));
    // The Match feature now opens the wizard's first step.
    expect(screen.getByRole("heading", { name: "Choose your sources" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: /Back/ }));
    expect(screen.getByRole("heading", { name: "What would you like to do?" })).toBeInTheDocument();
  });

  it("opens the convert wizard from the hub and returns", async () => {
    renderWithI18n(
      <ThemeProvider>
        <App />
      </ThemeProvider>,
    );

    await userEvent.click(screen.getByRole("button", { name: /Convert format/ }));
    expect(
      screen.getByRole("heading", { name: "Choose what to convert" }),
    ).toBeInTheDocument();

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

    await expect(commands.ping()).resolves.toEqual({
      message: "pong",
      appVersion: "0.1.0",
    });
  });
});
