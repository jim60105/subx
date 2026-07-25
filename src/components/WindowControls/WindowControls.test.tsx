import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeLanguage } from "../../i18n";
import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { WindowControls } from "./WindowControls";

const mockMinimize = vi.fn().mockResolvedValue(undefined);
const mockToggleMaximize = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);
const mockIsMaximized = vi.fn().mockResolvedValue(false);
const mockUnlisten = vi.fn();
let resizedCallback: (() => Promise<void> | void) | null = null;

const mockOnResized = vi.fn().mockImplementation((cb: () => Promise<void> | void) => {
  resizedCallback = cb;
  return Promise.resolve(mockUnlisten);
});

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: mockMinimize,
    toggleMaximize: mockToggleMaximize,
    close: mockClose,
    isMaximized: mockIsMaximized,
    onResized: mockOnResized,
  }),
}));

describe("WindowControls", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    resizedCallback = null;
    mockIsMaximized.mockResolvedValue(false);
    await setupI18n("en");
  });

  // @covers custom-titlebar/window-control-buttons-in-the-application-header#minimize-button-minimizes-the-window
  it("minimizes the window when the minimize button is clicked", async () => {
    renderWithI18n(<WindowControls />);
    const minimizeBtn = screen.getByRole("button", { name: "Minimize" });
    await userEvent.click(minimizeBtn);
    expect(mockMinimize).toHaveBeenCalledOnce();
  });

  // @covers custom-titlebar/window-control-buttons-in-the-application-header#maximize-button-maximizes-the-window
  it("maximizes the window when non-maximized and maximize button is clicked", async () => {
    renderWithI18n(<WindowControls />);
    const maximizeBtn = await screen.findByRole("button", { name: "Maximize" });
    await userEvent.click(maximizeBtn);
    expect(mockToggleMaximize).toHaveBeenCalledOnce();
  });

  // @covers custom-titlebar/window-control-buttons-in-the-application-header#restore-button-restores-the-window
  it("restores the window when maximized and restore button is clicked", async () => {
    mockIsMaximized.mockResolvedValue(true);
    renderWithI18n(<WindowControls />);
    const restoreBtn = await screen.findByRole("button", { name: "Restore" });
    await userEvent.click(restoreBtn);
    expect(mockToggleMaximize).toHaveBeenCalledOnce();
  });

  // @covers custom-titlebar/window-control-buttons-in-the-application-header#close-button-closes-the-window
  it("closes the window when close button is clicked", async () => {
    renderWithI18n(<WindowControls />);
    const closeBtn = screen.getByRole("button", { name: "Close" });
    await userEvent.click(closeBtn);
    expect(mockClose).toHaveBeenCalledOnce();
  });

  // @covers custom-titlebar/window-control-buttons-in-the-application-header#close-button-shows-danger-hover
  it("applies the danger hover class to the close button", () => {
    renderWithI18n(<WindowControls />);
    const closeBtn = screen.getByRole("button", { name: "Close" });
    expect(closeBtn).toHaveClass("window-controls__btn--close");
  });

  // @covers custom-titlebar/maximize-state-tracking#icon-updates-on-external-maximize
  it("updates icon on external window resize events", async () => {
    mockIsMaximized.mockResolvedValue(false);
    renderWithI18n(<WindowControls />);
    expect(await screen.findByRole("button", { name: "Maximize" })).toBeInTheDocument();

    mockIsMaximized.mockResolvedValue(true);
    await act(async () => {
      if (resizedCallback) {
        await resizedCallback();
      }
    });

    expect(await screen.findByRole("button", { name: "Restore" })).toBeInTheDocument();
  });

  // @covers custom-titlebar/window-control-localization#window-controls-display-localized-labels
  it("displays localized labels after language change", async () => {
    renderWithI18n(<WindowControls />);
    expect(screen.getByRole("button", { name: "Minimize" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Close" })).toBeInTheDocument();

    await act(() => changeLanguage("zh-TW"));

    expect(screen.getByRole("button", { name: "最小化" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "關閉" })).toBeInTheDocument();
  });
});
