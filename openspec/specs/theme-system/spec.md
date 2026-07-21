# theme-system Specification

## Purpose

The application's visual identity and theming behaviour: a dark and a light theme sharing one neon-gradient accent, expressed entirely as CSS custom properties, following the operating system preference by default and overridable by the user.

## Requirements

### Requirement: Dual light/dark themes with neon-gradient identity

The application SHALL provide a dark theme and a light theme sharing the same visual identity: violet `#7c3aed` → cyan `#06b6d4` gradient accents. The dark theme SHALL use the deep-navy base `#0d1021` with glassmorphism-styled panels. All theme values SHALL be exposed as CSS custom properties so components never hard-code colors.

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
