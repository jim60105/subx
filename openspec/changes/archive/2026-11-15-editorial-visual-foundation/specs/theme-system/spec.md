# theme-system Delta

## RENAMED Requirements

- FROM: `### Requirement: Dual light/dark themes with neon-gradient identity`
- TO: `### Requirement: Dual light/dark themes with editorial paper-and-ink identity`

## MODIFIED Requirements

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

## ADDED Requirements

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
