import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { changeLanguage } from "../../i18n";
import { LANGUAGE_STORAGE_KEY } from "../../i18n/languages";
import { renderWithI18n, setupI18n } from "../../test/renderWithI18n";
import { ThemeProvider } from "../../theme/ThemeProvider";
import { AppHeader } from "./AppHeader";

const mockToggleMaximize = vi.fn().mockResolvedValue(undefined);
const mockMinimize = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn().mockResolvedValue(undefined);

vi.mock("@tauri-apps/api/window", () => ({
  getCurrentWindow: () => ({
    minimize: mockMinimize,
    toggleMaximize: mockToggleMaximize,
    close: mockClose,
    isMaximized: vi.fn().mockResolvedValue(false),
    onResized: vi.fn().mockResolvedValue(vi.fn()),
  }),
}));

function renderHeader(onNavigateHome?: () => void, onOpenSettings?: () => void) {
  return renderWithI18n(
    <ThemeProvider>
      <AppHeader onNavigateHome={onNavigateHome} onOpenSettings={onOpenSettings} />
    </ThemeProvider>,
  );
}

describe("AppHeader", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await setupI18n("en");
  });

  it("makes the brand interactive only on a feature screen", () => {
    const { container: hub } = renderHeader();
    expect(hub.querySelector(".app-header__brand")).not.toHaveAttribute("role", "button");
    expect(screen.queryByRole("button", { name: /Back to home/ })).not.toBeInTheDocument();

    renderHeader(() => {});
    expect(screen.getByRole("button", { name: /Back to home/ })).toBeInTheDocument();
  });

  /// WCAG 2.5.3: the accessible name has to contain the visible one, or a
  /// voice-control user who says "click SubX" reaches nothing. An `aria-label`
  /// would replace the brand text rather than extend it.
  it("keeps the visible brand text inside the accessible name", () => {
    renderHeader(() => {});
    const brand = screen.getByRole("button", { name: /Back to home/ });

    expect(brand).not.toHaveAttribute("aria-label");
    expect(brand).toHaveAccessibleName(expect.stringContaining("SubX"));
    expect(brand).toHaveAttribute("title", "Back to home");
  });

  it("returns to the hub when the brand is used", async () => {
    const onNavigateHome = vi.fn();
    renderHeader(onNavigateHome);

    await userEvent.click(screen.getByRole("button", { name: /Back to home/ }));

    expect(onNavigateHome).toHaveBeenCalledOnce();
  });

  /// The brand replaced a button labelled "Back", which read as step-level
  /// retreat although it abandoned the whole feature. Only the wizards' own
  /// back slot may carry that label now.
  it("renders no separate back button", () => {
    renderHeader(() => {});

    expect(screen.queryByRole("button", { name: "Back" })).not.toBeInTheDocument();
  });

  it("renders the shared language and theme controls", () => {
    renderHeader();

    // Behaviour of the controls themselves is covered by LanguageSelect's and
    // ThemeSelect's own tests; this only checks the header wires them in.
    expect(screen.getByLabelText("Language")).toBeInTheDocument();
    expect(screen.getByLabelText("Theme")).toBeInTheDocument();
  });

  // @covers app-shell/appheader-floating-chrome-and-control-layout#preference-dropdown-popover-floats-above-page-content
  // @covers app-shell/appheader-floating-chrome-and-control-layout#header-controls-share-uniform-height-and-remain-visible-during-theme-toggle
  it("offers the settings entry everywhere except on settings itself", async () => {
    renderHeader();
    expect(screen.queryByRole("button", { name: "Settings" })).not.toBeInTheDocument();

    const onOpenSettings = vi.fn();
    renderHeader(undefined, onOpenSettings);
    const settingsButton = screen.getByRole("button", { name: "Settings" });
    expect(settingsButton).toHaveClass("app-header__settings");
    await userEvent.click(settingsButton);

    expect(onOpenSettings).toHaveBeenCalledOnce();
  });

  it("renders its own strings in Traditional Chinese after a language switch", async () => {
    renderHeader(() => {});
    expect(screen.getByRole("button", { name: /Back to home/ })).toBeInTheDocument();

    await act(() => changeLanguage("zh-TW"));

    expect(screen.getByRole("button", { name: /回到首頁/ })).toBeInTheDocument();
    expect(screen.getByLabelText("主題")).toBeInTheDocument();
    expect(screen.getByLabelText("語言")).toBeInTheDocument();
    expect(screen.getByText("AI 字幕工具")).toBeInTheDocument();
    expect(window.localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("zh-TW");
  });

  // @covers custom-titlebar/header-drag-region-for-window-repositioning#drag-the-window-by-the-header
  it("carries data-tauri-drag-region attribute on header and toggles maximize on header double-click", async () => {
    const { container } = renderHeader();
    const header = container.querySelector("header.app-header");
    expect(header).toHaveAttribute("data-tauri-drag-region");

    if (header) {
      await userEvent.dblClick(header);
      expect(mockToggleMaximize).toHaveBeenCalledOnce();
    }
  });

  // @covers app-shell/appheader-floating-chrome-and-control-layout#dragging-the-brand-does-not-move-the-window
  it("keeps the brand out of the drag region so pressing it cannot drag the window", async () => {
    renderHeader(() => {});
    const brand = screen.getByRole("button", { name: /Back to home/ });

    expect(brand).not.toHaveAttribute("data-tauri-drag-region");
    expect(brand.querySelector("[data-tauri-drag-region]")).toBeNull();

    mockToggleMaximize.mockClear();
    await userEvent.dblClick(brand);
    expect(mockToggleMaximize).not.toHaveBeenCalled();
  });

  // @covers custom-titlebar/header-drag-region-for-window-repositioning#header-buttons-remain-clickable
  it("renders window controls and keeps header interactive buttons clickable without double-click maximize trigger", async () => {
    const onOpenSettings = vi.fn();
    renderHeader(undefined, onOpenSettings);

    expect(screen.getByRole("group", { name: "Window controls" })).toBeInTheDocument();

    const settingsButton = screen.getByRole("button", { name: "Settings" });
    await userEvent.click(settingsButton);
    expect(onOpenSettings).toHaveBeenCalledOnce();

    mockToggleMaximize.mockClear();
    await userEvent.dblClick(settingsButton);
    expect(mockToggleMaximize).not.toHaveBeenCalled();
  });
});
