# theme-system Delta

## MODIFIED Requirements

### Requirement: Preference dropdown controls render custom DOM popovers matching active theme

Where a preference is presented as a dropdown, its select control (`PreferenceSelect`, and `ThemeSelect` / `LanguageSelect` in their dropdown form) SHALL render a custom HTML/CSS DOM popover menu styled using CSS design tokens instead of an OS-native dropdown widget. Popover menus SHALL dynamically match the active theme (light background with primary text in light theme, dark background with primary text in dark theme), bypassing operating system native widget styling.

#### Scenario: Preference select popover adapts to light theme

- **GIVEN** the application light theme is active on a system with dark OS preferences
- **WHEN** the user opens a preference dropdown control in the app header
- **THEN** the popover menu renders inside the DOM with a light background and readable text matching the light theme tokens

#### Scenario: Preference select popover adapts to dark theme

- **GIVEN** the application dark theme is active
- **WHEN** the user opens a preference dropdown control
- **THEN** the popover menu renders inside the DOM with a dark background and readable text matching the dark theme tokens
