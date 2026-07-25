# custom-titlebar Specification

## Purpose

Window controls, drag-to-move, and maximize-state tracking for the frameless window chrome.

## Requirements

### Requirement: Window control buttons in the application header

The `AppHeader` SHALL render window-control buttons — minimize, maximize/restore, and close — at the far right of the header bar, after all existing preference controls. Each button SHALL have an accessible `aria-label` sourced from the `common` i18n namespace (`titlebar.minimize`, `titlebar.maximize`, `titlebar.restore`, `titlebar.close`). The close button SHALL use a distinct danger-coloured hover state.

#### Scenario: Minimize button minimizes the window

- **WHEN** the user clicks the minimize button in the header
- **THEN** the application window minimizes to the taskbar / system tray

#### Scenario: Maximize button maximizes the window

- **WHEN** the window is in its normal (non-maximized) state and the user clicks the maximize button
- **THEN** the window maximizes to fill the screen and the button icon changes to a restore icon

#### Scenario: Restore button restores the window

- **WHEN** the window is maximized and the user clicks the restore button
- **THEN** the window restores to its previous size and position and the button icon changes back to the maximize icon

#### Scenario: Close button closes the window

- **WHEN** the user clicks the close button in the header
- **THEN** the application window closes and the process exits

#### Scenario: Close button shows danger hover

- **WHEN** the user hovers over the close button
- **THEN** the button background changes to the danger colour token

### Requirement: Header drag region for window repositioning

The application header container SHALL act as a drag region, allowing the user to click and drag on empty header space to reposition the window. Interactive child elements (buttons, dropdowns, selectors) within the header SHALL remain clickable and SHALL NOT trigger window dragging.

#### Scenario: Drag the window by the header

- **WHEN** the user clicks and drags on empty space in the application header
- **THEN** the window moves following the pointer

#### Scenario: Header buttons remain clickable

- **WHEN** the user clicks a button, dropdown, or selector inside the header
- **THEN** the click triggers the element's action and does NOT initiate a window drag

### Requirement: Maximize state tracking

The `WindowControls` component SHALL track whether the window is currently maximized and display the appropriate icon (maximize vs. restore). The component SHALL update its state when the window is maximized or restored by any means (button click, OS keyboard shortcut, or window manager action).

#### Scenario: Icon updates on external maximize

- **WHEN** the user maximizes the window using an OS keyboard shortcut or window manager action
- **THEN** the window-control button icon updates to the restore icon without requiring user interaction with the custom controls

### Requirement: Window control localization

All window control button labels SHALL be sourced from the `common` i18n namespace with keys `titlebar.minimize`, `titlebar.maximize`, `titlebar.restore`, and `titlebar.close`. Both `en` and `zh-TW` locale files SHALL contain these keys.

#### Scenario: Window controls display localized labels

- **WHEN** the user switches the application language between English and Traditional Chinese
- **THEN** the window control buttons' accessible labels update to the corresponding language
