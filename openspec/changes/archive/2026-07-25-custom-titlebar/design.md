## Context

SubX is a Tauri 2 + React 18 desktop application. The main window currently uses native OS window decorations (`"decorations"` defaults to `true` in `tauri.conf.json`). The `AppHeader` component is a fixed glassmorphic bar at the top that already contains navigation controls (back button, language picker, theme picker, settings button). The header uses design tokens exclusively (`--surface`, `--surface-blur`, `--text-secondary`, etc.) and sits at `z-index: 100`.

Tauri 2 provides:
- A `"decorations": false` window config flag to remove the native title bar and window border.
- JavaScript APIs in `@tauri-apps/api/window` for `minimize()`, `toggleMaximize()`, `close()`, `startDragging()`, and `onResized()`.
- An HTML attribute `data-tauri-drag-region` that lets any DOM element act as a native drag handle.
- A capability permission system that must explicitly allow `core:window:allow-minimize`, `core:window:allow-toggle-maximize`, `core:window:allow-close`, and `core:window:allow-start-dragging`.

The project is pre-release (zero users), so no migration or backward compatibility concerns exist.

## Goals / Non-Goals

**Goals:**

- Remove the native OS title bar and window border to achieve a modern frameless look.
- Embed minimize, maximize/restore, and close controls into the existing `AppHeader` at the far right.
- Make the header background act as a drag region for window repositioning.
- Track maximize state to dynamically swap the maximize/restore icon.
- Keep all visual values within the design token system.
- Support both light and dark themes for the custom titlebar controls.
- Provide localized accessible labels for the window control buttons.

**Non-Goals:**

- Custom window resize handles or snapping behavior — the OS already handles this even for frameless windows.
- Platform-specific title bar button ordering (e.g., macOS left-aligned traffic lights) — SubX is a Linux-targeted app per the build requirements.
- Menu bar integration — SubX has no application menu.
- Transparent or shaped windows — the window remains rectangular.
- Any changes to the Rust backend or IPC command layer — window operations use the Tauri JS API directly.

## Decisions

### Decision 1: Integrate window controls into `AppHeader` rather than a separate titlebar component

**Choice**: Add a `WindowControls` child component rendered inside `AppHeader.__right` / `AppHeader.__controls`, after the existing preference controls.

**Why**: The `AppHeader` already occupies the top of the viewport, is fixed-position, and has the correct z-index stacking. Adding a separate titlebar above it would waste vertical space and create competing drag regions. Integrating into the existing header keeps the layout compact — exactly one bar at the top.

**Alternative considered**: A dedicated `<Titlebar>` component above `AppHeader` — rejected because it doubles the chrome height and complicates stacking.

### Decision 2: Use `data-tauri-drag-region` on the header bar itself

**Choice**: Apply `data-tauri-drag-region` to the `<header>` element (the `.app-header` container). Interactive children (buttons, dropdowns) naturally intercept clicks, so they remain functional.

**Why**: Tauri's drag-region attribute only triggers a window drag when the user clicks on the element itself (not on interactive children). This means we don't need to manually carve out exclusion zones for buttons. The attribute on the container element makes the entire "dead space" of the header draggable, which matches user expectations.

**Alternative considered**: A dedicated `<div className="drag-region">` spanning only the empty space — rejected because it requires flex calculations to fill gaps around variable-width controls and is fragile when the layout changes.

### Decision 3: Create a `WindowControls` React component using `@tauri-apps/api/window`

**Choice**: A new `src/components/WindowControls/WindowControls.tsx` component that:
1. Calls `getCurrentWindow()` from `@tauri-apps/api/window` to get the window handle.
2. Provides three buttons: minimize, maximize/restore, close.
3. Listens to the window's `onResized` event to detect maximize state changes and swaps the icon accordingly. The listener is registered inside a `useEffect` hook; the Tauri `unlisten` callback (returned as a `Promise<UnlistenFn>`) is resolved and stored so it can be called in the effect cleanup function to prevent memory leaks.
4. Uses `useTranslation('common')` for `aria-label` attributes.

**Why**: This keeps window-control logic isolated from the `AppHeader` business concerns. The component is small, focused, and testable in isolation.

### Decision 4: Add titlebar tokens to `tokens.css`

**Choice**: Add these tokens:
- `--titlebar-btn-size: 36px` — matches existing header control height for visual uniformity.
- `--titlebar-close-hover: var(--danger)` — re-use the existing danger color token for the close-button hover state.
- `--titlebar-btn-gap: 0` — window control buttons sit flush (no gap) for a native-feeling control strip.

**Why**: The token system is enforced by tests. Using existing tokens (like `--danger`) where possible minimizes token bloat.

### Decision 5: No Rust code changes

**Choice**: All window operations use the Tauri JS API (`@tauri-apps/api/window`). No new Tauri commands are created.

**Why**: Tauri 2 already exposes `minimize()`, `toggleMaximize()`, `close()`, `startDragging()`, and `isMaximized()` through its built-in JS bridge. These only need capability permissions to be enabled (`core:window:allow-minimize`, `core:window:allow-toggle-maximize`, `core:window:allow-close`, `core:window:allow-start-dragging`, `core:window:allow-is-maximized`), not custom Rust command handlers. This keeps the Rust backend as a thin CLI translation layer per the architecture invariant.

## Risks / Trade-offs

- **[Risk] Drag region conflicts with deeply nested interactive elements** → Tauri's `data-tauri-drag-region` already handles this correctly by only activating on direct clicks to the attributed element. Dropdown popover menus render outside the header via portals and use `z-index: 1000`, so they won't conflict. Mitigation: verify in integration tests that all header controls remain clickable.

- **[Risk] Linux window manager differences for frameless windows** → Some tiling window managers may handle `decorations: false` differently (e.g., i3 may still draw borders). Mitigation: this is a well-known Tauri pattern; tiling WM users typically override per-app. The existing Wayland/NVIDIA fix in the app-shell spec is orthogonal.

- **[Risk] `onResized` event may not fire on all maximize state transitions** → Some Linux desktop environments (XFCE, older KDE) may report window maximization inconsistently. Mitigation: use the `isMaximized()` async check as a fallback within the resize handler, and default to the maximize icon on mount.

- **[Trade-off] No macOS traffic-light style** → Since SubX targets Linux, we use a right-aligned control layout. If macOS support is added later, conditional platform detection would be needed.

- **[Risk] Frameless window may lose edge resize handles on some Linux DEs** → GTK frameless windows on Linux may lose native edge drag-to-resize areas on certain desktop environments (especially tiling WMs). Mitigation: verify during manual testing (task 7.4); if edge-resizing is lost, consider CSS-based invisible edge resize borders or Tauri border resize configuration.

- **[Risk] Double-click to toggle maximize may not work automatically** → `data-tauri-drag-region` handles single mousedown for dragging but may not automatically hook double-click to maximize/restore. Mitigation: verify during manual testing (task 7.3); if not supported, add an `onDoubleClick` handler that calls `toggleMaximize()`.
