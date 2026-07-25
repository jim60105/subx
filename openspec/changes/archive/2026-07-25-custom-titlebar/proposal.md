## Why

Modern desktop applications — VS Code, Discord, Spotify, Obsidian — universally replace the native OS title bar with a custom frameless chrome that integrates window controls directly into the application header. This delivers a more polished, immersive UI by reclaiming the ~30 px of dead space occupied by the native title bar and unifying visual identity across platforms. SubX currently uses the default OS window decorations, which look dated and inconsistent with its premium glassmorphic design language. Removing the native title bar and embedding minimize / maximize-restore / close controls into the existing `AppHeader` will give SubX a modern, professional look that matches its visual ambitions.

No backward compatibility or migration concerns exist since SubX is pre-release with zero users in the wild.

## What Changes

- **Tauri window becomes frameless**: set `"decorations": false` in `tauri.conf.json` to remove the native title bar and window border.
- **Custom window-control buttons**: add minimize, maximize/restore, and close buttons to the right edge of the existing `AppHeader` component using `@tauri-apps/api/window` APIs (`minimize()`, `toggleMaximize()`, `close()`).
- **Drag region**: make the `AppHeader` bar a window-drag region via the `data-tauri-drag-region` attribute, allowing users to reposition the window by dragging the header — while ensuring interactive child elements (buttons, dropdowns) remain clickable.
- **Maximize state tracking**: listen for Tauri window resize events to swap the maximize/restore icon dynamically.
- **Capability permissions**: add `core:window:allow-minimize`, `core:window:allow-toggle-maximize`, `core:window:allow-close`, `core:window:allow-start-dragging`, and `core:window:allow-is-maximized` to the capability allowlist.
- **Design tokens**: add new tokens for the titlebar control buttons (sizing, hover colors, close-button danger hover) so styles stay within the token system.
- **Localization**: add `titlebar.minimize`, `titlebar.maximize`, `titlebar.restore`, `titlebar.close` keys to both `en` and `zh-TW` common namespace for accessible `aria-label` attributes.

## Capabilities

### New Capabilities

- `custom-titlebar`: Window controls, drag-to-move, and maximize-state tracking for the frameless window chrome.

### Modified Capabilities

- `app-shell`: The AppHeader requirement expands to include window-control buttons and the drag region; the Tauri window config changes to `decorations: false`.

## Impact

- **Frontend**: `AppHeader` component gains a new `WindowControls` section and `data-tauri-drag-region` attribute on its drag region. `AppHeader.css` grows with window-control styles. `tokens.css` adds a small set of titlebar tokens.
- **Tauri config**: `tauri.conf.json` adds `"decorations": false` to the window object.
- **Capabilities**: `default.json` adds four `core:window:allow-*` permissions.
- **i18n**: Both `en/common.json` and `zh-TW/common.json` gain `titlebar.*` keys.
- **Tests**: New unit tests for the `WindowControls` component; existing `AppHeader` tests updated to account for the structural change. `hardCodedStrings` and `localeParity` tests automatically cover the new keys.
- **No Rust backend changes**: window manipulation is handled entirely through the Tauri JS API and configuration; no new Tauri commands or Rust code are needed.
