# theme-system Specification

## Purpose

The application's visual identity and theming behaviour: a dark and a light theme sharing one neon-gradient accent, expressed entirely as CSS custom properties, following the operating system preference by default and overridable by the user.

## Requirements

### Requirement: Dual light/dark themes with neon-gradient identity

The application SHALL provide a dark theme and a light theme sharing the official Rust programming language brand identity: Rust orange `#e05d26` → terracotta `#b7410e` gradient accents. The dark theme SHALL use the mdBook deep charcoal base `#141518` with glassmorphism-styled panels. All theme values SHALL be exposed as CSS custom properties so components never hard-code colors.

#### Scenario: Both themes render every shell screen

- **WHEN** the user views the home hub or any shell component in either theme
- **THEN** all text meets readable contrast against its background and accent elements use the shared gradient in both themes

### Requirement: Theme follows system preference by default

On first launch, the application SHALL select the theme from the operating system's `prefers-color-scheme`. While no manual override exists, a change in the system preference SHALL be reflected live.

#### Scenario: First launch on a dark-mode system

- **WHEN** the app first launches on a system preferring dark mode
- **THEN** the dark theme is active without user action

#### Scenario: System preference changes at runtime

- **WHEN** no manual override is set and the OS switches from light to dark
- **THEN** the app switches to the dark theme without restart

### Requirement: Manual theme override is persisted

The user SHALL be able to override the theme (light / dark / follow-system). A manual override SHALL persist across restarts in GUI-local storage and SHALL NOT be written to the shared CLI configuration file.

#### Scenario: Override survives restart

- **WHEN** the user selects the light theme on a dark-mode system and restarts the app
- **THEN** the light theme is active after restart

#### Scenario: Returning to follow-system

- **WHEN** the user selects follow-system after having overridden the theme
- **THEN** the theme immediately matches the current OS preference and resumes live-following it

### Requirement: Preference dropdown controls render custom DOM popovers matching active theme

Preference select controls (`PreferenceSelect`, `ThemeSelect`, `LanguageSelect`) SHALL render custom HTML/CSS DOM popover menus styled using CSS design tokens instead of OS-native dropdown widgets. Popover menus SHALL dynamically match the active theme (light background with primary text in light theme, dark background with primary text in dark theme), bypassing operating system native widget styling.

#### Scenario: Preference select popover adapts to light theme

- **GIVEN** the application light theme is active on a system with dark OS preferences
- **WHEN** the user opens a preference dropdown control in the app header or settings screen
- **THEN** the popover menu renders inside the DOM with a light background and readable text matching the light theme tokens

#### Scenario: Preference select popover adapts to dark theme

- **GIVEN** the application dark theme is active
- **WHEN** the user opens a preference dropdown control
- **THEN** the popover menu renders inside the DOM with a dark background and readable text matching the dark theme tokens

