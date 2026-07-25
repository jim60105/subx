## 1. Tauri Configuration

- [x] 1.1 Set `"decorations": false` in `src-tauri/tauri.conf.json` window config to remove the native title bar
- [x] 1.2 Add `core:window:allow-minimize`, `core:window:allow-toggle-maximize`, `core:window:allow-close`, `core:window:allow-start-dragging`, and `core:window:allow-is-maximized` permissions to `src-tauri/capabilities/default.json`

## 2. Design Tokens

- [x] 2.1 Add titlebar-specific tokens to `src/styles/tokens.css`: `--titlebar-btn-size`, `--titlebar-close-hover`, `--titlebar-btn-gap` (use existing tokens like `--danger` where possible)

## 3. Localization

- [x] 3.1 Add `titlebar.minimize`, `titlebar.maximize`, `titlebar.restore`, `titlebar.close` keys to `src/locales/en/common.json`
- [x] 3.2 Add the same keys with Traditional Chinese translations to `src/locales/zh-TW/common.json`

## 4. WindowControls Component

- [x] 4.1 Create `src/components/WindowControls/WindowControls.tsx` with minimize, maximize/restore, and close buttons using `@tauri-apps/api/window` APIs (`getCurrentWindow().minimize()`, `.toggleMaximize()`, `.close()`)
- [x] 4.2 Create `src/components/WindowControls/WindowControls.css` with styles using design tokens: uniform 36 px button height, flush layout (no gap), danger hover on close button
- [x] 4.3 Implement maximize state tracking via `onResized` event listener with `isMaximized()` fallback to swap maximize/restore icon dynamically. Register the listener inside a `useEffect` hook and return the Tauri `unlisten` callback in the cleanup function to prevent memory leaks. Consider extracting this into a `useWindowMaximized()` custom hook for testability
- [x] 4.4 Add SVG icon components for minimize, maximize, restore, and close (or inline SVGs within `WindowControls`)

## 5. AppHeader Integration

- [x] 5.1 Add `data-tauri-drag-region` attribute to the `<header>` element in `AppHeader.tsx` to enable window dragging on empty header space. Add `user-select: none` to `.app-header` CSS to explicitly prevent text selection in the drag region
- [x] 5.2 Render `<WindowControls />` inside `AppHeader`'s right-side controls section, after existing preference controls (language, theme, settings)
- [x] 5.3 Add a visual separator (thin divider) between the existing preference controls and the window controls for clear visual grouping

## 6. Tests

- [x] 6.1 Create `src/components/WindowControls/WindowControls.test.tsx` with unit tests covering: render with correct buttons, click handlers call Tauri window APIs, maximize/restore icon toggle, accessible labels from i18n. Mock `@tauri-apps/api/window` APIs. Add `// @covers` annotations for each spec scenario
- [x] 6.2 Update `src/components/AppHeader/AppHeader.test.tsx` to verify that `WindowControls` is rendered and the `data-tauri-drag-region` attribute is present on the header element
- [x] 6.3 Verify `localeParity.test.ts` passes with the new `titlebar.*` keys in both locales
- [x] 6.4 Verify `hardCodedStrings.test.tsx` passes (no hard-coded strings in the new component)

## 7. Verification

- [x] 7.1 Run `npm run verify` to confirm TypeScript compilation, all tests pass with ≥85% coverage, and spec traceability checks pass
- [x] 7.2 Run `npm run tauri dev` and manually verify: frameless window opens, drag-by-header works, minimize/maximize/restore/close buttons function, buttons show correct hover states, theme toggle and language switch work with the new controls
- [x] 7.3 Verify double-click on the header drag region toggles maximize/restore (if Tauri 2 handles this automatically via `data-tauri-drag-region`; if not, implement a `dblclick` handler that calls `toggleMaximize()`)
- [x] 7.4 Verify frameless window resizing works on the target Linux DE (resize handles at window edges should still function despite `decorations: false`)
- [x] 7.5 Verify window control buttons are keyboard-accessible (focusable via Tab, activatable via Enter/Space)
