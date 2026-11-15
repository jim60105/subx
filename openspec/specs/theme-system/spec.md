# theme-system Specification

## Purpose

The application's visual identity and theming behaviour: a dark and a light theme sharing one editorial paper-and-ink identity with a marker-only vermilion accent and a bundled serif, expressed entirely as CSS custom properties, following the operating system preference by default and overridable by the user.

## Requirements

### Requirement: Dual light/dark themes with editorial paper-and-ink identity

The application SHALL provide a dark theme and a light theme sharing one editorial identity: a paper background, ink text and rules, and a single vermilion accent used as a marker and never as a button fill. All theme values SHALL be exposed as CSS custom properties declared in one token file so components never hard-code colors. Glass, gradient, glow, and shadow styling SHALL NOT be used, and corners SHALL be square or near-square.

#### Scenario: Both themes render every shell screen

- **WHEN** either theme is active
- **THEN** every text colour token meets a 4.5:1 contrast ratio against both the window background token and the hover/selected fill token, the text colour used on an ink fill meets 4.5:1 against that fill, and the marker accent meets 3:1 against the window background

#### Scenario: Colours are declared only in the token file

- **WHEN** any stylesheet other than the token file, or any inline style in a component, is inspected
- **THEN** it contains no colour literal, colour function, or named colour, so every colour follows the active theme

#### Scenario: Every referenced token is declared

- **WHEN** a stylesheet or inline style references a custom property
- **THEN** that property is declared by the token file for both themes or in the referencing stylesheet itself, so no reference to a removed legacy token survives

#### Scenario: No glass, gradient, glow, or shadow

- **WHEN** the stylesheets are inspected
- **THEN** none declares a backdrop filter, a box or text shadow, a blur filter, a translucent colour mix, or a gradient in any property other than a mask

#### Scenario: Corners are square

- **WHEN** the stylesheets are inspected
- **THEN** every corner radius is the control radius token, zero, or a full circle, so no pill or large rounded shape exists

#### Scenario: Primary buttons are ink-filled

- **WHEN** the shared button styles are inspected
- **THEN** the primary rank is filled with the ink token and labelled with the on-ink token, and no button rank uses the accent token as its fill

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

### Requirement: Bundled serif typeface

The application SHALL bundle one serif typeface as a WOFF2 asset declared by an `@font-face` rule with a local source, so serif text renders identically offline. The serif SHALL be offered in regular weight only and SHALL be applied without synthetic bold or italic. Every character of every locale string SHALL be covered by the bundled serif. Sans-serif and monospace text SHALL use system font stacks and bundle nothing.

#### Scenario: Serif is served from the application bundle

- **WHEN** the font declaration and the application entry document are inspected
- **THEN** the serif's source is a font file that exists inside the frontend source tree, and no stylesheet or entry document references a remote host

#### Scenario: Every locale string is covered

- **WHEN** the character map of the bundled font file is compared with every character of every string in every supported locale
- **THEN** the font contains a glyph for each of them, so no string can silently fall back to a system serif

#### Scenario: Serif is regular weight without synthesis

- **WHEN** the stylesheets are inspected
- **THEN** the serif family is applied by a single shared rule that sets regular weight, upright style, and disables font synthesis, and no other rule references the serif family
